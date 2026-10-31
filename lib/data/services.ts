import { ruleFromRow, type PricingRule } from "@/lib/service-pricing";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Service, ServiceCategory, Country } from "@/lib/supabase/types";

/* Per-country price overrides travel WITH the service, every time.
 *
 * They were added to the database first, and the catalogue kept rendering
 * services.base_price_cents — so Wait in Line advertised $15 while
 * price_service_cents charged US$35 / CA$40 at submission. A price the
 * customer reads must be the price they are charged, so the override comes
 * back on the same row as the base and there is no query that can forget
 * it. */
/*
  The per-country overrides travel with the service on every read.

  THE SELECT MUST NAME EVERY OVERRIDDEN COLUMN. It listed only the base
  and the time block, while localizeRule() below reads
  per_extra_unit_cents and per_extra_crew_cents as well — so those two
  arrived undefined and silently fell back to the rule, quoting a
  Canadian a US per-parcel and per-helper price. That is the same bug
  this constant exists to prevent, one field deeper, which is why there
  is one select and not a per-query list.
*/
export const SERVICE_SELECT =
  "*, category:service_categories(*), country_pricing:service_country_pricing(country, base_price_cents, extra_block_cents, per_extra_unit_cents, per_extra_crew_cents)";

import type { CountryPrice } from "@/lib/country-price";
export type { CountryPrice as ServiceCountryPrice } from "@/lib/country-price";

export type ServiceWithCategory = Service & {
  category: ServiceCategory;
  country_pricing?: CountryPrice[] | null;
};

/* Build-time-safe variants — use service-role client (no cookies()) so they
   can run inside generateStaticParams / static pre-render. The catalog is
   RLS-readable by anyone, so service-role is equivalent here. */
export async function listServicesPublic(): Promise<ServiceWithCategory[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_SELECT)
    .eq("active", true)
    .order("popular", { ascending: false })
    .order("title");
  if (error) {
    console.error("listServicesPublic error:", error.message);
    return [];
  }
  return (data ?? []) as ServiceWithCategory[];
}

export async function listCategoriesPublic(): Promise<ServiceCategory[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    console.error("listCategoriesPublic error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getServicePublic(slug: string): Promise<ServiceWithCategory | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_SELECT)
    .eq("id", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("getServicePublic error:", error.message);
    return null;
  }
  // maybeSingle returns null (not error) when no row matches active=true,
  // which makes inactive services 404 cleanly via the page's notFound() call.
  return (data as ServiceWithCategory) ?? null;
}

/* Service catalog reads. Always use server client — RLS lets anyone read
   active services. */
export async function listServices(opts?: {
  country?: Country;
  categoryId?: string;
}): Promise<ServiceWithCategory[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("services")
    .select(SERVICE_SELECT)
    .eq("active", true)
    .order("popular", { ascending: false })
    .order("title");

  if (opts?.categoryId) {
    query = query.eq("category_id", opts.categoryId);
  }
  if (opts?.country) {
    query = query.contains("countries", [opts.country]);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listServices error:", error.message);
    return [];
  }
  return (data ?? []) as ServiceWithCategory[];
}

export async function listCategories(): Promise<ServiceCategory[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_categories")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) {
    console.error("listCategories error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getService(slug: string): Promise<ServiceWithCategory | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_SELECT)
    .eq("id", slug)
    .single();
  if (error) {
    console.error("getService error:", error.message);
    return null;
  }
  return data as ServiceWithCategory;
}

/**
 * Pricing rules, keyed by service id.
 *
 * Fetched so the form can quote live as the customer answers. The server
 * prices the same request independently through price_service_cents() —
 * a price the browser computed is a price the browser chose, so this one
 * is for display only, and scripts/verify-pricing-parity.mjs asserts the
 * two arithmetics agree across 3,808 combinations.
 */
export async function listPricingRules(): Promise<Record<string, PricingRule>> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("service_pricing").select("*");
  const out: Record<string, PricingRule> = {};
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const rule = ruleFromRow(row);
    if (rule) out[rule.serviceId] = rule;
  }
  return out;
}

/*
  The same rules, but build-safe.

  listPricingRules() uses the cookie-bound client, which cannot run
  inside a static pre-render. The public service pages need the rule to
  explain how a price is worked out, and the rules are the same for
  everyone, so service-role is equivalent here.
*/
export async function listPricingRulesPublic(): Promise<Record<string, PricingRule>> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from("service_pricing").select("*");
  if (error) {
    console.error("listPricingRulesPublic error:", error.message);
    return {};
  }
  const out: Record<string, PricingRule> = {};
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const rule = ruleFromRow(row);
    if (rule) out[rule.serviceId] = rule;
  }
  return out;
}

/*
  Which services are delivered entirely by phone call.

  Public pages used to promise "Real-time GPS tracking" and answer "How
  fast can a helper arrive?" on services where nobody travels anywhere.
  Read rather than hardcoded, so flipping `delivered_by_call` on a
  service is enough to correct its page.
*/
export async function listCallDeliveredServiceIds(): Promise<Set<string>> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("service_completion_requirements")
    .select("service_id")
    .eq("delivered_by_call", true);
  if (error) {
    // An empty set means every page keeps the in-person wording, which
    // is the wrong answer for two services but a safe one for 24.
    console.error("listCallDeliveredServiceIds error:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.service_id as string));
}
