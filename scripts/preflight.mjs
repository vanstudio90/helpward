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
import {
  refFromPostgresUri, refFromRestUrl, refFromKey, assertProductionTarget,
} from "./lib/target.mjs";

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
  // Production-only, and checked FIRST because the identity and origin
  // checks below are what make a GO mean anything.
  { key: "HELPWARD_PRODUCTION_REF", level: WANT_PROD ? "block" : "warn",
    breaks: "Nothing can verify WHICH project is being checked, so GO would mean " +
            "\"these variables are individually present\", not \"this is the right environment\"." },
  { key: "HELPWARD_PRODUCTION_ORIGIN", level: WANT_PROD ? "block" : "warn",
    breaks: "NEXT_PUBLIC_SITE_URL cannot be checked against the intended launch host, " +
            "so a preview origin would pass and send every reset link to a throwaway deployment." },
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
    /*
     * In production this must be the DECLARED origin, parsed as a URL.
     *
     * The previous rule only rejected a hostname ENDING in "vercel.app",
     * so https://preview.vercel.app/ passed — a preview origin, which
     * sends every password-reset link to a deployment that will be
     * replaced. Substring rules on URLs keep failing this way, so this
     * parses the URL and compares the hostname to HELPWARD_PRODUCTION_ORIGIN.
     *
     * The whitespace rule applies everywhere: a trailing newline in this
     * variable produced unusable reset links on two sibling sites.
     */
    expect: (v) => {
      if (!WANT_PROD) return true;
      let u;
      try { u = new URL(v); } catch { return false; }
      if (u.protocol !== "https:") return false;
      const want = (process.env.HELPWARD_PRODUCTION_ORIGIN ?? "").trim();
      if (!want) return false;
      let wantHost;
      try { wantHost = new URL(want).hostname; } catch { wantHost = want; }
      return u.hostname.toLowerCase() === wantHost.toLowerCase();
    },
    expectMsg: "in production this must parse as https:// and its hostname must equal " +
               "HELPWARD_PRODUCTION_ORIGIN (set that to the real launch origin). " +
               "A preview or *.vercel.app host sends every reset link to a deployment that will be replaced." },
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
// 1b. One identity — the SQL connection, the REST URL and the keys must
//     all be the same project
// ---------------------------------------------------------------------
//
// GO used to be reachable with the SQL connection aimed at one project
// and the app's URL and service key aimed at another. Every individual
// check passed because each looked at its own variable in isolation;
// nothing asked whether they described the SAME environment. A
// production app reading one database while migrations ran against
// another is a configuration that cannot be detected after the fact.
section("1b. Project identity");
if (!WANT_PROD) {
  pass("identity", "skipped outside --production (rehearsal values are expected to differ)");
} else {
  const sqlRef = refFromPostgresUri(process.env.PRODUCTION_DATABASE_URL ?? "").ref;
  const restRef = refFromRestUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonRef = refFromKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const svcRef = refFromKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const report = assertProductionTarget([
      { label: "SQL connection (PRODUCTION_DATABASE_URL)", ref: sqlRef },
      { label: "app REST URL (NEXT_PUBLIC_SUPABASE_URL)", ref: restRef },
      { label: "anon key", ref: anonRef },
      { label: "service-role key", ref: svcRef },
    ]);
    for (const line of report.verified) pass("identity", line);
    for (const label of report.unverified) {
      // Opaque sb_* keys cannot be decoded. Say that the check could not
      // run rather than implying it passed — an authenticated read below
      // is what actually proves such a key works.
      warn("identity", `${label}: project could not be verified from the value`,
        "Newer sb_* keys are opaque. The authenticated read probe below is the real check.");
    }
  } catch (err) {
    block("identity", "Production target is not one consistent project",
      String(err.message ?? err).replace(/\n\s*/g, " "));
  }
}

// ---------------------------------------------------------------------
// 2. Stripe — mode, key agreement, and whether the account can actually
//    take money
// ---------------------------------------------------------------------
section("2. Stripe");
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
      "Real customers' cards cannot be charged with a test key.");
  } else {
    pass("stripe", `keys agree: ${skLive ? "live" : "test"} mode`);

    /*
     * A key prefix is not activation.
     *
     * `sk_live_…` only means a live key exists. It says nothing about
     * whether Stripe has finished reviewing the business, and a live key
     * on an unactivated account fails at the first charge — after a
     * customer has entered their card. The account object is the
     * authority, so ask it.
     */
    try {
      const res = await fetch("https://api.stripe.com/v1/account", {
        headers: { authorization: `Bearer ${sk}` },
      });
      if (!res.ok) {
        const body = await res.text();
        block("stripe", `Stripe rejected the secret key (${res.status})`,
          body.slice(0, 180));
      } else {
        const acct = await res.json();

        /*
         * charges_enabled is the authority IN PRODUCTION, and only there.
         *
         * A Stripe SANDBOX account reports charges_enabled:false while
         * test charges work perfectly — rehearsal has captured real test
         * holds against exactly this account. So blocking on it outside
         * production would fail a healthy rehearsal, which is a guard
         * refusing the correct state.
         *
         * In production it is the thing a key prefix cannot tell you:
         * `sk_live_…` only means a live key exists, not that Stripe has
         * finished reviewing the business. A live key on an unactivated
         * account fails at the first charge — after a customer has
         * entered their card.
         */
        if (acct.charges_enabled === true) {
          pass("stripe", "account charges_enabled");
        } else if (WANT_PROD) {
          block("stripe", "Stripe account cannot accept charges yet",
            "charges_enabled is false: activation is incomplete or Stripe is still " +
            "reviewing. A live key alone does not mean the account can take money.");
        } else {
          pass("stripe", "charges_enabled is false, which is normal for a sandbox",
            "Test charges still work; this is only a blocker under --production.");
        }

        if (acct.payouts_enabled === true) {
          pass("stripe", "account payouts_enabled");
        } else if (WANT_PROD) {
          block("stripe", "Stripe account payouts are not enabled",
            "Helpward could collect but never be paid out. Usually a missing bank account.");
        } else {
          pass("stripe", "payouts_enabled is false (normal for a sandbox)");
        }
        if (skLive) {
          warn("stripe", "LIVE mode: every charge is real money",
            "Do the first production booking yourself, on the cheapest service, and refund it.");
        }
      }
    } catch (err) {
      block("stripe", "Could not reach Stripe to confirm the account is active",
        String(err.message ?? err).slice(0, 160));
    }
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

  /*
   * Sub-daily schedules need a plan that supports them.
   *
   * My first version of this said "on Hobby, crons run once a day and
   * only two are allowed; the rest never fire and nothing reports it."
   * Two of those three claims were wrong: Hobby allows 100 jobs per
   * project, and a deployment carrying a sub-daily schedule is REJECTED
   * rather than silently degraded. Loud is better, but the warning was
   * describing a failure mode that does not happen.
   */
  const subDaily = declared.filter((c) => {
    const [min, hr] = c.schedule.split(/\s+/);
    return min.includes("*") || min.includes("/") || hr.includes("*") || hr.includes("/");
  });
  if (subDaily.length > 0) {
    warn("cron", `${subDaily.length} of ${declared.length} job(s) are sub-daily — the plan must allow that cadence`,
      "A Hobby deployment carrying a sub-daily schedule is rejected, so this does not " +
      "deploy at all there. The constraint is the cadence, not the job count. " +
      `Most frequent: ${subDaily.map((c) => `${c.name} (${c.schedule})`).slice(0, 3).join(", ")}. ` +
      "A registered schedule is still not evidence of a successful run — check the logs after deploy.");
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

    // --- service areas: ACTIVE datasets, coverage, geometry, dispatch ---
    //
    // Counting polygons was not a coverage check. is_point_serviceable
    // (migration 0033) joins service_area_datasets ON is_active, and
    // returns 'no_dataset' — fail-closed — when no dataset is active at
    // all. So a database holding a pile of INACTIVE polygons dispatches
    // nothing while a row count looks healthy. An audit got GO out of
    // exactly that state.
    //
    // What is checked now: an ACTIVE dataset per declared area, every
    // approved municipality present in it, geometry that is valid and
    // non-empty, the stored feature_count matching the rows, and finally
    // the real function answering correctly for a known point inside
    // each area and one outside all of them.
    const areaSrc = fs.readFileSync("lib/service-areas.ts", "utf8");
    const declaredAreas = [];
    {
      // Each area block: id, then its municipalities array.
      const re = /\bid:\s*"([a-z0-9-]+)"[\s\S]*?municipalities:\s*(\[[\s\S]*?\])/g;
      let m;
      while ((m = re.exec(areaSrc)) !== null) {
        const munis = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        declaredAreas.push({ id: m[1], municipalities: munis });
      }
    }
    if (declaredAreas.length === 0) {
      block("db", "Could not read any service area from lib/service-areas.ts",
        "Everything about coverage below is unchecked.");
    }

    const { rows: activeSets } = await client.query(`
      select d.id, d.area_id, d.feature_count,
             count(b.id)                                   as rows,
             count(b.boundary)                             as with_geom,
             count(*) filter (where b.boundary is not null
                                and not st_isvalid(b.boundary::geometry)) as invalid,
             count(*) filter (where b.boundary is not null
                                and st_isempty(b.boundary::geometry))     as empty
        from service_area_datasets d
        left join service_area_boundaries b on b.dataset_id = d.id
       where d.is_active
       group by d.id, d.area_id, d.feature_count`);
    const activeByArea = new Map(activeSets.map((r) => [r.area_id, r]));

    for (const area of declaredAreas) {
      const set = activeByArea.get(area.id);
      if (!set) {
        block("db", `service area "${area.id}" has NO ACTIVE boundary dataset`,
          "is_point_serviceable returns 'no_dataset' and the dispatch guard refuses " +
          "EVERY address, so no booking can be created. Inactive polygons do not count. " +
          "Load and then --activate a dataset (docs/BOUNDARY-DATASETS.md).");
        continue;
      }
      if (Number(set.with_geom) === 0) {
        block("db", `active dataset for "${area.id}" has no geometry`, `dataset ${set.id}`);
        continue;
      }
      if (Number(set.invalid) > 0 || Number(set.empty) > 0) {
        block("db", `active dataset for "${area.id}" has unusable geometry`,
          `${set.invalid} invalid, ${set.empty} empty — st_covers cannot match against these.`);
        continue;
      }
      if (set.feature_count != null && Number(set.feature_count) !== Number(set.rows)) {
        block("db", `active dataset for "${area.id}" is incomplete`,
          `feature_count says ${set.feature_count} but ${set.rows} boundary rows exist.`);
        continue;
      }

      // Every approved municipality must actually be in the active set.
      // A dataset missing Surrey is not "Lower Mainland coverage"; it is
      // a dataset that silently refuses Surrey addresses.
      const { rows: haveMunis } = await client.query(
        "select municipality from service_area_boundaries where dataset_id = $1", [set.id]);
      const norm = (x) => String(x).toLowerCase()
        .replace(/^(city|district|township|town|village) of /, "")
        .replace(/ (city|district|township|town|village)$/, "").trim();
      const present = new Set(haveMunis.map((r) => norm(r.municipality)));
      const missing = area.municipalities.filter((m) => !present.has(norm(m)));
      if (missing.length > 0) {
        block("db", `active dataset for "${area.id}" is missing ${missing.length} approved municipality(ies)`,
          `${missing.join(", ")} — addresses there are refused while the area reads as covered.`);
      } else {
        pass("db", `"${area.id}" — active dataset, ${set.rows} polygons, all ` +
                   `${area.municipalities.length} approved municipality(ies) present`);
      }
    }

    const orphans = activeSets.filter((r) => !declaredAreas.some((a) => a.id === r.area_id));
    if (orphans.length) {
      warn("db", `${orphans.length} ACTIVE dataset(s) for area(s) the code no longer declares`,
        `${orphans.map((r) => r.area_id).join(", ")} — these still match addresses in ` +
        "is_point_serviceable, so they can accept bookings in a market that was retired.");
    }

    // --- the real function, on real points -----------------------------
    //
    // Everything above is structure. This is the behaviour customers hit.
    const PROBES = [
      { name: "Vancouver downtown", lng: -123.1207, lat: 49.2827, expect: "serviceable" },
      { name: "Surrey",             lng: -122.8490, lat: 49.1913, expect: "serviceable" },
      { name: "San Diego downtown", lng: -117.1611, lat: 32.7157, expect: "serviceable" },
      { name: "Chicago",            lng:  -87.6298, lat: 41.8781, expect: "outside_boundary" },
      { name: "Los Angeles (retired market)", lng: -118.2437, lat: 34.0522, expect: "outside_boundary" },
    ];
    for (const p of PROBES) {
      const { rows: [r] } = await client.query(
        "select is_point_serviceable(st_setsrid(st_makepoint($1,$2),4326)::geography) as verdict",
        [p.lng, p.lat]);
      const verdict = r?.verdict ?? "(null)";
      if (verdict === p.expect) {
        pass("db", `dispatch probe: ${p.name} -> ${verdict}`);
      } else {
        block("db", `dispatch probe: ${p.name} -> ${verdict}, expected ${p.expect}`,
          verdict === "no_dataset"
            ? "No active dataset covers anything: every booking is refused."
            : "Coverage does not match the declared launch areas.");
      }
    }

    // --- catalogue: the expected launch set, by id ---
    //
    // A positive count is not a catalogue check. A database with ONE
    // active service passed, because "more than zero" was the whole
    // test — and a launch missing twenty-six services is not a launch.
    // The expected set is the seed catalogue in the repo, which is the
    // only written-down statement of what Helpward offers.
    const seedSql = fs.readFileSync("supabase/migrations/0003_seed_catalog.sql", "utf8");
    const expectedIds = [...seedSql.matchAll(/^\s*\('([a-z0-9-]+)',\s*'[a-z-]+',/gm)]
      .map((m) => m[1]);

    const { rows: liveServices } = await client.query(
      "select id, base_price_cents from services where active order by id");
    const liveIds = new Set(liveServices.map((r) => r.id));

    if (expectedIds.length === 0) {
      warn("db", "Could not read the expected service ids from 0003_seed_catalog.sql",
        `Falling back to a count check: ${liveIds.size} active services.`);
      if (liveIds.size === 0) block("db", "No active services");
    } else {
      const missing = expectedIds.filter((id) => !liveIds.has(id));
      const extra = [...liveIds].filter((id) => !expectedIds.includes(id));
      if (missing.length > 0) {
        block("db", `${missing.length} of ${expectedIds.length} launch service(s) are not active`,
          `${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}`);
      } else {
        pass("db", `all ${expectedIds.length} launch services active`);
      }
      if (extra.length > 0) {
        warn("db", `${extra.length} active service(s) not in the seed catalogue`,
          `${extra.join(", ")} — bookable but never reviewed as part of the launch set.`);
      }
    }

    const unpriced = liveServices.filter((r) => Number(r.base_price_cents) <= 0);
    if (unpriced.length > 0) {
      block("db", `${unpriced.length} active service(s) priced at zero`,
        unpriced.map((r) => r.id).join(", "));
    } else if (liveServices.length > 0) {
      pass("db", "every active service has a price");
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
