import fs from "node:fs"; import path from "node:path"; import pg from "pg";
for (const f of [".env.rehearsal", ".env.local"]) {
  const p = path.resolve(f); if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const prod = process.argv.includes("--production");
const url = prod ? process.env.PRODUCTION_DATABASE_URL : (process.env.REHEARSAL_DATABASE_URL || process.env.DATABASE_URL);
if (!url) { console.error("no url"); process.exit(1); }
const sql = process.argv.slice(2).filter(a => !a.startsWith("--")).join(" ") || fs.readFileSync(0, "utf8");
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
c.on("notice", (n) => console.log("NOTICE:", n.message));
await c.connect();
try {
  const r = await c.query(sql);
  for (const res of (Array.isArray(r) ? r : [r])) {
    if (res.rows) console.log(JSON.stringify(res.rows, null, 1));
  }
} catch (e) { console.error("ERR", e.message); process.exitCode = 1; }
await c.end();
