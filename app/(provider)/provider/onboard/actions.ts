"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { startHelperOnboarding, refreshHelperPayoutState } from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

const RETURN_TO = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://helpward.com"}/provider/onboard`;

export type OnboardState = { error?: string; success?: string } | undefined;

// Persist which services a helper offers.
//
// This is the single reason matching could never produce a match: the
// onboarding page rendered checkboxes that were never wired to anything, so
// provider_services was empty across the entire estate. find_nearby_providers
// INNER JOINs that table, so every broadcast returned zero candidates no
// matter how many helpers were approved and online.
//
// RLS policy ps_self_write already restricts writes to provider_id =
// auth.uid(), so this runs as the caller — no service-role client.
export async function saveProviderServicesAction(
  _prev: OnboardState,
  formData: FormData,
): Promise<OnboardState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be logged in." };

  // The helper must actually have a provider profile — otherwise the FK on
  // provider_services(provider_id) would fail with an opaque error.
  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!pp) return { error: "You don't have a helper profile yet." };

  const submitted = formData.getAll("service_id").map(String).filter(Boolean);
  const unique = Array.from(new Set(submitted));

  if (unique.length === 0) {
    return { error: "Pick at least one service you can offer." };
  }
  if (unique.length > 50) {
    return { error: "That's more services than the catalog has." };
  }

  // Validate every id against the live catalog. Never trust the form: a
  // crafted post could otherwise register a helper for an inactive or
  // non-existent service and poison the matching join.
  const { data: validRows, error: svcErr } = await supabase
    .from("services")
    .select("id")
    .in("id", unique)
    .eq("active", true);
  if (svcErr) return { error: "Couldn't verify those services." };

  const valid = new Set((validRows ?? []).map((r) => r.id as string));
  const rejected = unique.filter((id) => !valid.has(id));
  if (rejected.length > 0) {
    return { error: `Not available: ${rejected.slice(0, 3).join(", ")}` };
  }

  // Replace the set, additions first. Upsert (not insert) because the
  // primary key is (provider_id, service_id) and re-saving an unchanged
  // selection must not error. Doing the upsert BEFORE the delete means a
  // mid-way failure leaves the helper with too many services rather than
  // none — the safe direction, since zero services silently removes them
  // from matching entirely.
  const { error: upErr } = await supabase
    .from("provider_services")
    .upsert(
      [...valid].map((service_id) => ({ provider_id: user.id, service_id })),
      { onConflict: "provider_id,service_id" },
    );
  if (upErr) return { error: upErr.message };

  // Compute the removals in JS rather than building a PostgREST `not.in`
  // filter string — service ids are free-form text keys and embedding them
  // in a filter expression is a quoting hazard.
  const { data: existing } = await supabase
    .from("provider_services")
    .select("service_id")
    .eq("provider_id", user.id);
  const stale = (existing ?? [])
    .map((r) => r.service_id as string)
    .filter((id) => !valid.has(id));
  if (stale.length > 0) {
    const { error: delErr } = await supabase
      .from("provider_services")
      .delete()
      .eq("provider_id", user.id)
      .in("service_id", stale);
    if (delErr) return { error: delErr.message };
  }

  revalidatePath("/provider/onboard");
  revalidatePath("/provider/dashboard");
  revalidatePath("/provider/inbox");
  return { success: `Saved — you'll be offered ${valid.size} service${valid.size === 1 ? "" : "s"}.` };
}

/**
 * Send the helper to Stripe to enter their identity and bank details.
 *
 * Nothing sensitive passes through Helpward: Stripe collects the SSN, the
 * bank account and the tax details on its own pages and files the helper's
 * 1099. Helpward stores only the connected-account id.
 */
export async function startPayoutSetupAction() {
  if (!stripeConfigured()) {
    return { error: "Payout setup is not available yet." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const started = await startHelperOnboarding(user.id, RETURN_TO);
  if (!started.ok) return { error: started.message };

  redirect(started.url);
}

/**
 * Pull the account's state back from Stripe when the helper returns.
 *
 * The account.updated webhook covers this too, but webhooks can lag by
 * seconds to minutes, and a helper who has just finished should not be
 * told they haven't. Whichever arrives first wins; both write the same
 * fields from the same source.
 */
export async function refreshPayoutStatusAction() {
  if (!stripeConfigured()) return { error: "Payouts are not available yet." };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: pp } = await supabase
    .from("provider_profiles")
    .select("stripe_connect_account_id")
    .eq("user_id", user.id)
    .single();

  if (!pp?.stripe_connect_account_id) {
    return { error: "Payout setup has not been started yet." };
  }

  const refreshed = await refreshHelperPayoutState(pp.stripe_connect_account_id);
  if (!refreshed.ok) return { error: refreshed.message };

  revalidatePath("/provider/onboard");
  revalidatePath("/provider/dashboard");
  return {
    success: refreshed.payable
      ? "Payouts are set up. You can accept jobs now."
      : "Stripe still needs more information before you can be paid.",
  };
}
