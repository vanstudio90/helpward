#!/usr/bin/env node
/*
 * Walk the App Review journey against production, as the reviewer will.
 *
 *   node scripts/review-journey.mjs                 # all eight services
 *   node scripts/review-journey.mjs errand-runner   # just one
 *
 * Signs in as the review customer, attaches a Stripe test card if none
 * exists, then for each service: creates a request, confirms the
 * controlled helper accepted it and the card was held, advances to
 * started, advances to completed, and reports the payment state at each
 * step. Nothing is written directly — every transition goes through the
 * same endpoints the app and the helper use.
 *
 * Reads credentials from ~/.helpward-cutover/review-account-credentials.
 */
import { readFileSync } from "node:fs";

const BASE = process.env.REVIEW_BASE ?? "https://helpward.com";
const CREDS = `${process.env.HOME}/.helpward-cutover/review-account-credentials`;
const PICKUP = "1055 W Georgia St, Vancouver, BC";
const DEST = "800 Robson St, Vancouver, BC";

function env(file) {
  const o = {};
  for (const l of readFileSync(file, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return o;
}
const local = env(".env.local");
const sandbox = env(".env.rehearsal");
const SUPA = local.NEXT_PUBLIC_SUPABASE_URL, ANON = local.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SK = sandbox.STRIPE_SECRET_KEY;
const SERVICE = local.SUPABASE_SERVICE_ROLE_KEY;

/*
  START COLD, because warm is the case that always worked.

  The controlled helpers stay online and nearby for 30 minutes after any
  request, so a second run found them already matchable and every service
  passed. App Review arrives days later at an hour nobody picks, which is
  the state this walk has to prove — and it is exactly the state that was
  broken: the first request of a session was offered to one helper, the
  acceptance was aimed at the other, and nothing was created.

  Taking them offline with a stale location before the first request
  makes this script reproduce that instead of stepping around it. Pass
  --warm to skip, which is only useful when debugging something else.
*/
async function goCold() {
  if (process.argv.includes("--warm")) return;
  if (!SERVICE) {
    console.log("  (no service-role key in .env.local — starting warm)");
    return;
  }
  const stale = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    `${SUPA}/rest/v1/provider_profiles?is_review_helper=eq.true`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ is_online: false, location_updated_at: stale }),
    },
  );
  const rows = await res.json();
  console.log(
    res.ok
      ? `  cold start: ${Array.isArray(rows) ? rows.length : "?"} controlled helper(s) offline, location 2h old`
      : `  could not go cold (HTTP ${res.status}) — starting warm`,
  );
}

let customerEmail, customerPassword;
for (const line of readFileSync(CREDS, "utf8").split("\n")) {
  const [role, email, password] = line.split("\t");
  if (role === "customer") { customerEmail = email; customerPassword = password; }
}
if (!customerPassword) { console.error(`No customer credentials in ${CREDS}`); process.exit(1); }

const INTAKE = {
  "errand-runner": { tasks: "Collect dry cleaning", stops: "Robson St dry cleaners", spend_cap: "20" },
  "maid-service": { bedrooms: "2", bathrooms: "1", focus: ["kitchen", "bathrooms"], supplies: "helper" },
  "moving-help": { destination: DEST, crew_size: "2", inventory: "Sofa, bed frame, 10 boxes",
                   access_from: "ground", access_to: "elevator", vehicle: "need-advice" },
  "furniture-assembly": { items: "One flat-pack wardrobe", item_count: "1", tools: "helper", disposal: "yes" },
  /*
    THE COLLECTION-ORDER SHAPE, which is what this service asks for now.

    These four keys were store/list/spend_cap/substitutions — a
    shop-for-me design that no longer exists. The service became "go and
    collect the order I already placed", so the server refused every
    request this walk made with "Which branch? is required" and the one
    service a reviewer is most likely to try went untested.

    order_ref and order_name are the sensitive pair: a reference and the
    name it is held under are between them enough to collect somebody
    else's shopping, so they are withheld from the offer and reach only
    the helper who accepts.
  */
  "grocery-pickup": { store: "Save-On-Foods", branch: "Robson St, Vancouver",
                      order_ref: "SOF-4471832", order_name: "App Review",
                      collection_slot: "today, 4-6pm", chilled: "some" },
  "package-delivery": { deliver_to: DEST, size: "small", weight_kg: "2", recipient: "Reception" },
  "package-return": { carrier: "canada-post", label_status: "printed", parcel_count: "2",
                      dropoff_point: "Robson St" },
  "wait-in-line": { what_for: "Box office tickets", expected_wait: "60", handover: "swap",
                    venue_name: "Orpheum Theatre", which_queue: "Box office",
                    venue_permission: "yes", notice_needed: "15", party_size: "1",
                    early_turn: "hold" },
};

const C = { ok: (s) => `\x1b[32m${s}\x1b[0m`, bad: (s) => `\x1b[31m${s}\x1b[0m`,
            dim: (s) => `\x1b[2m${s}\x1b[0m` };

// ---- sign in ---------------------------------------------------------
const tokRes = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: customerEmail, password: customerPassword }),
});
const tok = await tokRes.json();
if (!tok.access_token) { console.error("sign-in failed:", JSON.stringify(tok).slice(0, 200)); process.exit(1); }
const AUTH = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };
console.log(`  signed in as ${customerEmail}`);

// ---- card ------------------------------------------------------------
const cardsRes = await fetch(`${BASE}/api/v1/payment-methods`, { headers: AUTH });
const cards = await cardsRes.json();
if ((cards.cards ?? []).length === 0) {
  const start = await (await fetch(`${BASE}/api/v1/payment-methods`,
    { method: "POST", headers: AUTH, body: "{}" })).json();
  // The route hands back a client secret, as the app gets. The
  // SetupIntent id is its prefix: seti_XXX_secret_YYY.
  const siId = start.setupIntentId ?? start.id
    ?? (typeof start.clientSecret === "string" ? start.clientSecret.split("_secret_")[0] : null);
  if (!siId) { console.error("no SetupIntent returned:", JSON.stringify(start).slice(0, 200)); process.exit(1); }
  const conf = await (await fetch(`https://api.stripe.com/v1/setup_intents/${siId}/confirm`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(SK + ":").toString("base64")}`,
               "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ payment_method: "pm_card_visa" }),
  })).json();
  if (conf.error) { console.error("confirm failed:", conf.error.message); process.exit(1); }
  const saved = await (await fetch(`${BASE}/api/v1/payment-methods`,
    { method: "POST", headers: AUTH, body: JSON.stringify({ setupIntentId: siId }) })).json();
  console.log(`  card attached  ${saved.card?.brand ?? "?"} ••${saved.card?.last4 ?? "????"}  (${conf.status})`);
} else {
  const c = cards.cards[0];
  console.log(`  card present   ${c.brand} ••${c.last4}`);
}

// ---- walk ------------------------------------------------------------
// Skips flags, so `--warm` is not mistaken for a service id.
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const ids = only ? [only] : Object.keys(INTAKE);
let pass = 0, fail = 0;

await goCold();

for (const serviceId of ids) {
  process.stdout.write(`\n  ${serviceId}\n`);
  const body = { serviceId, address: PICKUP, intake: INTAKE[serviceId],
                 notes: "App Review demonstration booking." };
  const res = await fetch(`${BASE}/api/v1/requests`,
    { method: "POST", headers: AUTH, body: JSON.stringify(body) });
  const out = await res.json();

  if (!res.ok) {
    console.log(`    ${C.bad("FAIL")} create: HTTP ${res.status} ${JSON.stringify(out).slice(0, 220)}`);
    fail++; continue;
  }
  console.log(`    request ${out.requestId}  offered to ${out.candidateCount} helper(s)  ${out.currency} ${out.estimatedTotalCents}`);

  /*
    The route reports the controlled helper's action as reviewDemo and does
    NOT return a booking id — the app reads its bookings separately. So read
    it the same way, as the customer, which also proves RLS lets them see it.
  */
  if (!out.reviewDemo?.accepted) {
    console.log(`    ${C.bad("FAIL")} the controlled helper did not accept.`);
    /*
      The route now says WHY. It used to omit reviewDemo entirely on
      failure, which left this script dumping a response that looked
      exactly like an ordinary customer's.
    */
    if (out.reviewDemo?.error) console.log(`           ${out.reviewDemo.error}`);
    console.log(`           ${C.dim(JSON.stringify(out).slice(0, 300))}`);
    fail++; continue;
  }
  console.log(`    accepted: ${out.reviewDemo.note}`);

  const bk = await (await fetch(
    `${SUPA}/rest/v1/bookings?request_id=eq.${out.requestId}&select=id,status,payment_status`,
    { headers: { apikey: ANON, Authorization: `Bearer ${tok.access_token}` } })).json();
  const bookingId = Array.isArray(bk) ? bk[0]?.id : null;
  if (!bookingId) {
    console.log(`    ${C.bad("FAIL")} accepted but no booking is readable by the customer.`);
    fail++; continue;
  }
  console.log(`    booking ${bookingId}  ${bk[0].status}/${bk[0].payment_status}`);

  let okAll = true;
  for (const step of ["start", "complete"]) {
    const a = await fetch(`${BASE}/api/v1/review/advance`,
      { method: "POST", headers: AUTH, body: JSON.stringify({ bookingId }) });
    const aj = await a.json();
    const mark = a.ok ? C.ok("ok  ") : C.bad("FAIL");
    console.log(`    ${mark} advance (${step}): HTTP ${a.status} ${JSON.stringify(aj).slice(0, 160)}`);
    if (!a.ok) okAll = false;
  }
  const after = await (await fetch(
    `${SUPA}/rest/v1/bookings?id=eq.${bookingId}&select=status,payment_status`,
    { headers: { apikey: ANON, Authorization: `Bearer ${tok.access_token}` } })).json();
  if (Array.isArray(after) && after[0]) {
    console.log(`    final   ${after[0].status}/${after[0].payment_status}`);
    if (after[0].payment_status !== "captured") okAll = false;
  }
  okAll ? pass++ : fail++;
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
