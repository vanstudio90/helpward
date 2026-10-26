#!/usr/bin/env node
// Exercises the payment library against the REAL rehearsal database and the
// Stripe sandbox.
//
// Why this exists as a separate check: the unit tests cover arithmetic, and
// the Stripe script covers Stripe. Neither touches the queries in between,
// and that is exactly where the bugs were. Four functions read
// `profiles.stripe_customer_id` — a column that lives on customer_profiles.
// PostgREST fails the whole select, so every one of them returned "add a
// payment method" for a customer who had one. TypeScript saw nothing,
// because an unmodelled Supabase select is typed `any`.
//
// So: run the functions, against real schema, and see what comes back.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.rehearsal", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

if ((env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")) {
  console.error("REFUSING: live Stripe key."); process.exit(1);
}
for (const [k, v] of Object.entries(env)) process.env[k] ??= v;

const { createCardSetupIntent, ensureStripeCustomer, hasUsableCard } =
  await import("../lib/payments.ts");

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  if (cond) { console.log(`  \x1b[32mPASS\x1b[0m ${label}`); pass++; }
  else { console.log(`  \x1b[31mFAIL\x1b[0m ${label} ${detail}`); fail++; }
};

console.log("\nPayment wiring against the rehearsal database\n");

const { data: customers } = await admin
  .from("profiles").select("id, full_name").eq("role", "customer").limit(1);
const customer = customers?.[0];
if (!customer) { console.error("  No customer profile in the rehearsal database."); process.exit(1); }
console.log(`  customer: ${customer.full_name ?? customer.id}\n`);

// 1. The Stripe customer, created and persisted where it actually lives.
const ensured = await ensureStripeCustomer(customer.id);
ok("ensureStripeCustomer succeeds", ensured.ok, JSON.stringify(ensured));
if (ensured.ok) {
  ok("it returns a real Stripe customer id", /^cus_/.test(ensured.customerId), ensured.customerId);

  const { data: row, error } = await admin
    .from("customer_profiles").select("stripe_customer_id").eq("user_id", customer.id).maybeSingle();
  ok("it is persisted on customer_profiles, not profiles",
     !error && row?.stripe_customer_id === ensured.customerId,
     error?.message ?? `row=${JSON.stringify(row)}`);

  // Idempotent: a second call must reuse, not create a second customer.
  const again = await ensureStripeCustomer(customer.id);
  ok("a second call reuses the same customer",
     again.ok && again.customerId === ensured.customerId,
     JSON.stringify(again));
}

// 2. The SetupIntent the card form needs.
const setup = await createCardSetupIntent(customer.id);
ok("createCardSetupIntent succeeds", setup.ok, JSON.stringify(setup));
if (setup.ok) {
  ok("it returns a usable client secret", /^seti_.+_secret_/.test(setup.clientSecret),
     setup.clientSecret?.slice(0, 24));
}

// 3. And the dispatch gate reads cleanly.
const has = await hasUsableCard(customer.id);
ok("hasUsableCard returns a boolean without erroring", typeof has === "boolean", String(has));

// 4. The column that caused all of this is genuinely absent, so a
//    regression reintroducing it fails here rather than in production.
const { error: wrongColumn } = await admin
  .from("profiles").select("stripe_customer_id").limit(1);
ok("profiles.stripe_customer_id does NOT exist (the original mistake)",
   !!wrongColumn, "the column now exists — update readStripeCustomerId");

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
