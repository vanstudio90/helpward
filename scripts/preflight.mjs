#!/usr/bin/env node
/*
 * PRODUCTION CUTOVER PREFLIGHT — read-only.
 *
 * Everything about a production launch that can be checked WITHOUT the
 * owner standing over it, so that the steps which genuinely need them
 * are short, ordered, and the only things left.
 *
 * Point it at an environment and it reports GO / NO-GO per section. Run
 * it against the rehearsal project first (it should pass), then against
 * production AFTER the environment variables are set and migrations are
 * applied, and before taking a single real booking.
 *
 *   node scripts/preflight.mjs
 *
 * Why this exists: every variable below FAILS CLOSED when missing, which
 * is the right design and also the reason a broken cutover is silent. An
 * absent CRON_SECRET does not crash anything — isAuthorizedCron simply
 * returns false, so twelve scheduled jobs return 401 and do nothing:
 * no-shows are never cancelled, stale calls never swept, data-export
 * requests never processed. An absent STRIPE_WEBHOOK_SECRET returns 503,
 * so Stripe retries for a while and gives up, and bookings never learn
 * their payment succeeded. Nothing anywhere says so. This does.
 *
 * It never writes, and it never prints a secret — only whether one is
 * present, and what it is for.
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// ---------------------------------------------------------------------
// env loading — production variables must come from the real environment
// ---------------------------------------------------------------------
const WANT_PROD = process.argv.includes("--production");

if (!WANT_PROD) {
  for (const name of [".env.rehearsal", ".env.local"]) {
    const f = path.resolve(name);
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

const C = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const findings = [];
function record(level, section, msg, detail) {
  findings.push({ level, section, msg, detail });
  const tag = level === "block" ? C.bad("BLOCK") : level === "warn" ? C.warn(" WARN") : C.ok("   ok");
  console.log(`  ${tag}  ${msg}`);
  if (detail) console.log(`         ${C.dim(detail)}`);
}
const block = (s, m, d) => record("block", s, m, d);
const warn = (s, m, d) => record("warn", s, m, d);
const pass = (s, m, d) => record("pass", s, m, d);

function section(title) {
  console.log(`\n${C.bold(title)}`);
}

// ---------------------------------------------------------------------
// 1. Environment variables, grouped by what silently breaks without them
// ---------------------------------------------------------------------
const ENV_SPEC = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", level: "block",
    breaks: "Nothing works. The app cannot reach its database." },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", level: "block",
    breaks: "No user can sign in or read anything." },
  { key: "SUPABASE_SERVICE_ROLE_KEY", level: "block",
    breaks: "Payments, payouts and every cron fail — they all use the service client." },
  { key: "STRIPE_SECRET_KEY", level: "block",
    breaks: "stripeConfigured() is false: no card can be held, captured or refunded." },
  { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", level: "block",
    breaks: "The card form cannot mount, so no customer can add a card." },
  { key: "STRIPE_WEBHOOK_SECRET", level: "block",
    breaks: "Webhook returns 503. Stripe retries, then gives up; bookings never learn a payment succeeded." },
  { key: "STRIPE_CONNECT_WEBHOOK_SECRET", level: "block",
    breaks: "Helper payout state never updates, so a helper who finishes onboarding stays unable to accept work." },
  { key: "MAPBOX_TOKEN", level: "block",
    breaks: "No address can be geocoded, so NO booking can be created at all." },
  { key: "MAPBOX_PERMANENT", level: "block",
    breaks: "resolveAddressStrict refuses to mint an address it may not store. Every booking is refused.",
    expect: (v) => /^true$/i.test(v),
    expectMsg: 'must be "true" in production — Mapbox permanent-storage terms are required to keep a geocode' },
  { key: "CRON_SECRET", level: "block",
    breaks: "All 12 scheduled jobs return 401 and do nothing. Silent: no error anywhere." },
  { key: "NEXT_PUBLIC_SITE_URL", level: "block",
    breaks: "Password-reset and onboarding return links point at the wrong host.",
    // A rehearsal environment is SUPPOSED to be a vercel.app or localhost
    // host, so the real-origin rule only applies to production. The
    // whitespace rule applies everywhere: a trailing newline in this one
    // produced unusable password-reset links on two sibling sites before.
    expect: (v) => !WANT_PROD || (/^https:\/\//.test(v) && !/vercel\.app$/.test(v.trim())),
    expectMsg: "in production this must be the real https:// origin, not a *.vercel.app host" },
  { key: "RESEND_API_KEY", level: "warn",
    breaks: "No email is sent: no receipts, no reset links, no order confirmations. The app still works." },
  { key: "HELPWARD_EMAIL_FROM", level: "warn",
    breaks: "Email falls back to a default From address that may not be verified for the domain." },
  { key: "ONESIGNAL_APP_ID", level: "warn",
    breaks: "Push is a no-op. Booking reminders still arrive in-app and by email." },
  { key: "ONESIGNAL_REST_API_KEY", level: "warn",
    breaks: "Same: push silently skipped." },
  { key: "STRIPE_IDENTITY_WEBHOOK_SECRET", level: "warn",
    breaks: "ID verification is not wired anyway; nothing reads id_verified_at." },
  { key: "CHECKR_WEBHOOK_SECRET", level: "warn",
    breaks: "Background checks are not wired anyway; nothing reads background_verified_at." },
];

section("1. Environment variables");
for (const spec of ENV_SPEC) {
  const raw = process.env[spec.key];
  if (!raw || raw.trim().length === 0) {
    const fn = spec.level === "block" ? block : warn;
    fn("env", `${spec.key} is not set`, spec.breaks);
    continue;
  }
  if (raw !== raw.trim()) {
    block("env", `${spec.key} has leading or trailing whitespace`,
      "A trailing newline in a key produces authentication failures that look like a wrong key.");
    continue;
  }
  if (spec.expect && !spec.expect(raw)) {
    const fn = spec.level === "block" ? block : warn;
    fn("env", `${spec.key} is set but looks wrong`, spec.expectMsg);
    continue;
  }
  pass("env", `${spec.key} set`);
}

// ---------------------------------------------------------------------
// 2. Stripe mode — test keys cannot take real money
// ---------------------------------------------------------------------
section("2. Stripe mode");
{
  const sk = process.env.STRIPE_SECRET_KEY ?? "";
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  const skLive = sk.startsWith("sk_live_") || sk.startsWith("rk_live_");
  const pkLive = pk.startsWith("pk_live_");

  if (!sk || !pk) {
    block("stripe", "Cannot determine Stripe mode — a key is missing.");
  } else if (skLive !== pkLive) {
    block("stripe", "Stripe keys are in DIFFERENT modes",
      `secret=${skLive ? "live" : "test"}, publishable=${pkLive ? "live" : "test"}. ` +
      "The card form and the server would disagree about which account they are talking to.");
  } else if (!skLive && WANT_PROD) {
    block("stripe", "Stripe is in TEST mode while --production was requested",
      "Real customers' cards cannot be charged with a test key. Activate the account and swap both keys.");
  } else if (!skLive) {
    pass("stripe", "Stripe in test mode (correct for rehearsal)");
  } else {
    pass("stripe", "Stripe in live mode");
    warn("stripe", "Live mode: every charge below is real money",
      "Do the first production booking yourself, at the lowest-priced service, and refund it.");
  }
}

// ---------------------------------------------------------------------
// 3. Scheduled jobs — declared, present, and runnable on the plan
// ---------------------------------------------------------------------
section("3. Scheduled jobs");
{
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const declared = (vercel.crons ?? []).map((c) => ({
    name: c.path.split("/").pop(), path: c.path, schedule: c.schedule,
  }));
  const onDisk = fs.readdirSync("app/api/cron").filter((d) =>
    fs.existsSync(path.join("app/api/cron", d, "route.ts")));

  const missingRoute = declared.filter((c) => !onDisk.includes(c.name));
  const undeclared = onDisk.filter((d) => !declared.some((c) => c.name === d));

  if (missingRoute.length) {
    block("cron", `${missingRoute.length} cron(s) declared with no route`,
      missingRoute.map((c) => c.path).join(", "));
  }
  if (undeclared.length) {
    block("cron", `${undeclared.length} cron route(s) never scheduled`,
      `${undeclared.join(", ")} — the code exists and nothing will ever call it.`);
  }
  if (!missingRoute.length && !undeclared.length) {
    pass("cron", `all ${declared.length} scheduled jobs declared and present`);
  }

  // Vercel's Hobby plan runs crons once a day, at most two of them. Every
  // sub-daily schedule here needs Pro. Getting this wrong is invisible:
  // the deploy succeeds and the jobs simply never fire.
  const subDaily = declared.filter((c) => {
    const [min, hr] = c.schedule.split(/\s+/);
    return min.includes("*") || min.includes("/") || hr.includes("*") || hr.includes("/");
  });
  if (subDaily.length > 0) {
    warn("cron", `${subDaily.length} job(s) run more often than daily — needs a Vercel plan that allows it`,
      "On Hobby, crons run once a day and only two are allowed; the rest never fire and nothing reports it. " +
      `Most frequent: ${subDaily.map((c) => `${c.name} (${c.schedule})`).slice(0, 3).join(", ")}`);
  }
}

// ---------------------------------------------------------------------
// 4. Database: migrations, boundaries, catalogue, and rehearsal residue
// ---------------------------------------------------------------------
const dbUrl = WANT_PROD
  ? process.env.PRODUCTION_DATABASE_URL
  : (process.env.REHEARSAL_DATABASE_URL || process.env.DATABASE_URL);

section("4. Database");
if (!dbUrl) {
  block("db", `No database URL (${WANT_PROD ? "PRODUCTION_DATABASE_URL" : "REHEARSAL_DATABASE_URL"})`,
    "Everything below is unchecked.");
} else {
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
  });
  try {
    await client.connect();

    // --- migrations, in order, unmodified ---
    const files = fs.readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql")).sort();
    const { rows: applied } = await client.query(
      "select filename, sha256 from schema_migrations order by filename");
    const appliedNames = new Set(applied.map((r) => r.filename));
    const pending = files.filter((f) => !appliedNames.has(f));
    const unknown = applied.filter((r) => !files.includes(r.filename));

    if (pending.length) {
      block("db", `${pending.length} migration(s) not applied`,
        `${pending.slice(0, 5).join(", ")}${pending.length > 5 ? ", …" : ""} — run scripts/migrate.mjs`);
    } else {
      pass("db", `all ${files.length} migrations applied`);
    }
    if (unknown.length) {
      warn("db", `${unknown.length} applied migration(s) not in the repo`,
        `${unknown.map((r) => r.filename).join(", ")} — this database has history the code does not.`);
    }

    const crypto = await import("node:crypto");
    const drifted = applied.filter((r) => {
      if (!files.includes(r.filename)) return false;
      const sha = crypto.createHash("sha256")
        .update(fs.readFileSync(path.join("supabase/migrations", r.filename))).digest("hex");
      return r.sha256 && r.sha256 !== sha;
    });
    if (drifted.length) {
      block("db", `${drifted.length} applied migration(s) EDITED since they ran`,
        `${drifted.map((r) => r.filename).join(", ")} — the database does not match the file that built it.`);
    } else if (applied.length) {
      pass("db", "no applied migration has been edited since it ran");
    }

    // --- service areas and their boundaries ---
    //
    // The areas themselves are declared in lib/service-areas.ts; the
    // database holds their POLYGONS. Both halves have to be present, and
    // the failure mode when the polygons are missing is total: the
    // dispatch guard refuses every address, so no booking can be made at
    // all. That is the single most likely way a fresh production
    // database looks healthy and takes no orders.
    const declaredAreas = [...fs.readFileSync("lib/service-areas.ts", "utf8")
      .matchAll(/^\s*id:\s*"([a-z0-9-]+)"/gm)].map((m) => m[1]);

    const { rows: loaded } = await client.query(`
      select area_id,
             count(*) as rows,
             count(boundary) as with_geom
        from service_area_boundaries
       group by area_id order by area_id`);
    const byArea = new Map(loaded.map((r) => [r.area_id, r]));

    if (declaredAreas.length === 0) {
      block("db", "Could not read any service area from lib/service-areas.ts");
    }
    for (const id of declaredAreas) {
      const row = byArea.get(id);
      if (!row || Number(row.with_geom) === 0) {
        block("db", `service area "${id}" has no boundary polygon loaded`,
          "The dispatch guard refuses EVERY address in it, so no booking can be created. " +
          "Run: node scripts/load-boundaries.mjs");
      } else {
        pass("db", `service area "${id}" — ${row.with_geom} boundary polygon(s)`);
      }
    }
    const orphans = loaded.filter((r) => !declaredAreas.includes(r.area_id));
    if (orphans.length) {
      warn("db", `${orphans.length} boundary set(s) for area(s) the code no longer declares`,
        `${orphans.map((r) => r.area_id).join(", ")} — harmless, but they will never be matched against.`);
    }

    // --- catalogue ---
    const { rows: [cat] } = await client.query(`
      select count(*) filter (where active) as active,
             count(*) filter (where active and base_price_cents <= 0) as unpriced
        from services`);
    if (Number(cat.active) === 0) {
      block("db", "No active services", "There is nothing for a customer to book.");
    } else if (Number(cat.unpriced) > 0) {
      block("db", `${cat.unpriced} active service(s) priced at zero`);
    } else {
      pass("db", `${cat.active} active services, all priced`);
    }

    // --- claims guard (0065) ---
    const { rows: [claims] } = await client.query(`
      select count(*) as n from services
       where active and (
         blurb ilike '%background%check%' or blurb ilike '%vetted%'
         or blurb ilike '%insured%' or blurb ilike '%screened%')`);
    if (Number(claims.n) > 0) {
      block("db", `${claims.n} active service(s) claim screening or insurance`,
        "Neither is run. Migration 0065 should have fixed these.");
    } else {
      pass("db", "no active service claims screening or insurance");
    }

    // --- rehearsal residue, which must never reach production ---
    const { rows: [seed] } = await client.query(`
      select count(*) as n from auth.users
       where email ilike '%@example.com' or email ilike '%qa%@%' or email ilike '%rehearsal%'`);
    if (WANT_PROD && Number(seed.n) > 0) {
      block("db", `${seed.n} rehearsal/QA account(s) in the PRODUCTION database`,
        "These are real, loginable accounts. Remove them before taking real customers.");
    } else if (Number(seed.n) > 0) {
      pass("db", `${seed.n} rehearsal account(s) (expected outside production)`);
    } else {
      pass("db", "no rehearsal accounts");
    }

    // --- anything mid-flight that a cutover would strand ---
    const { rows: [live] } = await client.query(`
      select
        (select count(*) from requests where status = 'matching')      as matching,
        (select count(*) from bookings where status = 'in_progress')   as in_progress,
        (select count(*) from bookings
          where payment_status = 'authorized' and status <> 'completed') as holds,
        (select count(*) from call_sessions
          where status in ('ringing','connected'))                    as calls`);
    const stranded = Number(live.matching) + Number(live.in_progress)
                   + Number(live.holds) + Number(live.calls);
    if (stranded > 0) {
      warn("db", "work is mid-flight right now",
        `matching=${live.matching}, in_progress=${live.in_progress}, ` +
        `uncaptured holds=${live.holds}, live calls=${live.calls}. ` +
        "A deploy-coupled migration during this would strand it.");
    } else {
      pass("db", "nothing mid-flight — safe window for a deploy-coupled migration");
    }
  } catch (err) {
    block("db", "Could not check the database", String(err.message ?? err).slice(0, 200));
  } finally {
    try { await client.end(); } catch { /* already closed */ }
  }
}

// ---------------------------------------------------------------------
// verdict
// ---------------------------------------------------------------------
const blocks = findings.filter((f) => f.level === "block");
const warns = findings.filter((f) => f.level === "warn");

console.log();
if (blocks.length === 0) {
  console.log(C.ok(C.bold(`  GO — ${findings.length - warns.length} checks passed`))
    + (warns.length ? C.warn(`, ${warns.length} warning(s) to read first`) : ""));
} else {
  console.log(C.bad(C.bold(`  NO-GO — ${blocks.length} blocking issue(s)`))
    + (warns.length ? C.warn(`, ${warns.length} warning(s)`) : ""));
  for (const b of blocks) console.log(C.bad(`    · ${b.msg}`));
}
console.log(C.dim(`\n  ${WANT_PROD ? "PRODUCTION" : "rehearsal"} environment. Read-only; nothing was changed.\n`));
process.exit(blocks.length === 0 ? 0 : 1);
