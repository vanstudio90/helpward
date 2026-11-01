#!/usr/bin/env node
/*
 * Did the migrations that claim to be applied actually DO anything?
 *
 * WHY THIS EXISTS. The ledger is not evidence. Production carries rows
 * for 0044 and 0051 whose effects are absent, because an earlier ledger
 * backfill recorded files as applied without running them. The probe
 * used at the time looked for objects that SHOULD exist, so it could
 * never catch a migration whose job was to revoke, drop or replace —
 * the failure was invisible by construction.
 *
 * This reads every migration in order, builds the state they TOGETHER
 * claim to produce (so a later file dropping an earlier file's index is
 * not reported as missing), and compares that to the live catalog.
 *
 *   PRODUCTION_DATABASE_URL=... node scripts/audit-migration-effects.mjs
 *
 * What it checks: named indexes, policies, added and dropped columns,
 * functions, and revoked table privileges.
 *
 * What it CANNOT check, stated so the output is not mistaken for a
 * clean bill of health: the body of a function, the contents of a
 * policy expression, data backfills, and anything expressed only inside
 * a do-block. A pass here means the named objects are right, not that
 * every migration did everything it said.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DIR = "supabase/migrations";
const url = process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("Set PRODUCTION_DATABASE_URL."); process.exit(1); }

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

// Expected final state, built by replaying the files in order.
const idx = new Map();      // name -> { table, unique, file }
const pol = new Map();      // table.name -> { file }
const col = new Map();      // table.col -> { file, present }
const fns = new Map();      // name -> file
const revoked = new Map();  // table -> Map(role -> Set(priv))

const strip = (s) => s.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ");

for (const f of files) {
  const sql = strip(fs.readFileSync(path.join(DIR, f), "utf8")).toLowerCase();

  for (const m of sql.matchAll(/create (unique )?index (concurrently )?(if not exists )?([a-z0-9_]+) on (?:public\.)?([a-z0-9_]+)/g)) {
    idx.set(m[4], { table: m[5], unique: Boolean(m[1]), file: f });
  }
  for (const m of sql.matchAll(/drop index (if exists )?(?:public\.)?([a-z0-9_]+)/g)) idx.delete(m[2]);

  for (const m of sql.matchAll(/create policy ([a-z0-9_]+) on (?:public\.)?([a-z0-9_]+)/g)) {
    pol.set(`${m[2]}.${m[1]}`, { file: f });
  }
  for (const m of sql.matchAll(/drop policy (if exists )?([a-z0-9_]+) on (?:public\.)?([a-z0-9_]+)/g)) {
    pol.delete(`${m[3]}.${m[2]}`);
  }

  for (const m of sql.matchAll(/alter table (?:public\.)?([a-z0-9_]+)([^;]*)/g)) {
    const table = m[1];
    for (const a of m[2].matchAll(/add column (if not exists )?([a-z0-9_]+)/g)) {
      col.set(`${table}.${a[2]}`, { file: f, present: true });
    }
    for (const d of m[2].matchAll(/drop column (if exists )?([a-z0-9_]+)/g)) {
      col.set(`${table}.${d[2]}`, { file: f, present: false });
    }
  }

  for (const m of sql.matchAll(/create (or replace )?function (?:public\.)?([a-z0-9_]+)\s*\(/g)) {
    fns.set(m[2], f);
  }
  for (const m of sql.matchAll(/drop function (if exists )?(?:public\.)?([a-z0-9_]+)/g)) fns.delete(m[2]);

  for (const m of sql.matchAll(/revoke ([a-z, ]+?) on (?:table )?(?:public\.)?([a-z0-9_]+) from ([a-z_, ]+)/g)) {
    const privs = m[1].split(",").map((s) => s.trim().toUpperCase()).filter((s) => s && s !== "ALL");
    for (const role of m[3].split(",").map((s) => s.trim())) {
      if (!revoked.has(m[2])) revoked.set(m[2], new Map());
      const r = revoked.get(m[2]);
      if (!r.has(role)) r.set(role, new Set());
      for (const p of privs) r.get(role).add(p);
    }
  }
  // A later grant cancels an earlier revoke.
  for (const m of sql.matchAll(/grant ([a-z, ]+?) on (?:table )?(?:public\.)?([a-z0-9_]+) to ([a-z_, ]+)/g)) {
    const privs = m[1].split(",").map((s) => s.trim().toUpperCase());
    for (const role of m[3].split(",").map((s) => s.trim())) {
      const r = revoked.get(m[2]);
      if (!r?.has(role)) continue;
      if (privs.includes("ALL")) r.delete(role);
      else for (const p of privs) r.get(role).delete(p);
    }
  }
}

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await db.connect();

const live = {
  idx: new Map((await db.query(`select indexname, tablename, indexdef from pg_indexes where schemaname='public'`))
    .rows.map((r) => [r.indexname, r])),
  pol: new Set((await db.query(`select tablename, policyname from pg_policies where schemaname='public'`))
    .rows.map((r) => `${r.tablename}.${r.policyname}`)),
  col: new Set((await db.query(`select table_name, column_name from information_schema.columns where table_schema='public'`))
    .rows.map((r) => `${r.table_name}.${r.column_name}`)),
  fns: new Set((await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`))
    .rows.map((r) => r.proname)),
  grants: (await db.query(`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema='public'`)).rows,
};
const tables = new Set((await db.query(
  `select table_name from information_schema.tables where table_schema='public'`)).rows.map(r => r.table_name));
await db.end();

const findings = [];
const note = (sev, file, what) => findings.push({ sev, file, what });

for (const [name, want] of idx) {
  if (!tables.has(want.table)) continue;              // table itself was dropped later
  const got = live.idx.get(name);
  if (!got) note("MISSING", want.file, `index ${name} on ${want.table}`);
  else if (want.unique && !/unique index/i.test(got.indexdef)) {
    note("NOT UNIQUE", want.file, `index ${name} exists but is not UNIQUE`);
  }
}
for (const [key, want] of pol) {
  const [table] = key.split(".");
  if (!tables.has(table)) continue;
  if (!live.pol.has(key)) note("MISSING", want.file, `policy ${key}`);
}
for (const [key, want] of col) {
  const [table] = key.split(".");
  if (!tables.has(table)) continue;
  const there = live.col.has(key);
  if (want.present && !there) note("MISSING", want.file, `column ${key}`);
  if (!want.present && there) note("NOT DROPPED", want.file, `column ${key} still exists`);
}
for (const [name, file] of fns) {
  if (!live.fns.has(name)) note("MISSING", file, `function ${name}()`);
}
for (const [table, roles] of revoked) {
  if (!tables.has(table)) continue;
  for (const [role, privs] of roles) {
    for (const p of privs) {
      if (live.grants.some((g) => g.table_name === table && g.grantee === role && g.privilege_type === p)) {
        note("NOT REVOKED", "—", `${role} still holds ${p} on ${table}`);
      }
    }
  }
}

console.log(`\n  Replayed ${files.length} migrations against the live catalog.`);
console.log(`  Expected: ${idx.size} indexes · ${pol.size} policies · ${col.size} column changes · ${fns.size} functions\n`);

if (!findings.length) {
  console.log("  No discrepancies in named objects.\n");
} else {
  const order = { "NOT REVOKED": 0, "NOT DROPPED": 1, "NOT UNIQUE": 2, MISSING: 3 };
  findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file));
  for (const f of findings) console.log(`  ${f.sev.padEnd(12)} ${f.file.padEnd(42)} ${f.what}`);
  console.log(`\n  ${findings.length} discrepancies.\n`);
}
console.log("  Not covered: function bodies, policy expressions, data backfills,");
console.log("  and anything inside a do-block. A clean run is not a full guarantee.\n");
process.exit(findings.length ? 1 : 0);
