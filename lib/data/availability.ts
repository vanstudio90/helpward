import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type { WeeklyRule, DateOverride } from "@/lib/availability-pure";

// Re-export the pure types + functions so existing imports of
// "@/lib/data/availability" keep working. Only server-side fetchers live in
// this module because the Supabase imports above pull in next/headers,
// which would poison any client component that touched this file.
export type { WeeklyRule, DateOverride, AvailabilityStatus } from "@/lib/availability-pure";
export { computeAvailabilityStatus, totalWeeklyHours } from "@/lib/availability-pure";

// Provider's own rules — auth client respects RLS so it only returns the
// caller's rows. Used by /provider/schedule editor.
export async function getMyAvailability(): Promise<{ rules: WeeklyRule[]; overrides: DateOverride[]; vacation: { on: boolean; returnsOn: string | null } } | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: rules }, { data: overrides }, { data: pp }] = await Promise.all([
    supabase
      .from("provider_availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("provider_id", user.id)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("provider_availability_overrides")
      .select("id, date, is_unavailable, start_time, end_time, label")
      .eq("provider_id", user.id)
      .gte("date", today)
      .order("date"),
    supabase
      .from("provider_profiles")
      .select("vacation_mode, vacation_returns_on")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  return {
    rules: (rules ?? []) as WeeklyRule[],
    overrides: (overrides ?? []) as DateOverride[],
    vacation: { on: pp?.vacation_mode ?? false, returnsOn: pp?.vacation_returns_on ?? null },
  };
}

// Batched public read — same data as getProviderAvailability but for N
// helpers in 3 queries (rules .in(), overrides .in(), profile .in()) instead
// of N×3. Used by helper-list surfaces (/favorites, /saved-providers) to
// render an Available-now badge inline without blowing up the request count.
// Returns a Map keyed by user_id.
export async function getBatchAvailabilityStatus(
  providerIds: string[],
): Promise<Map<string, import("@/lib/availability-pure").AvailabilityStatus>> {
  const out = new Map<string, import("@/lib/availability-pure").AvailabilityStatus>();
  if (providerIds.length === 0) return out;
  const supabase = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: allRules }, { data: allOverrides }, { data: allProfiles }] = await Promise.all([
    supabase
      .from("provider_availability_rules")
      .select("provider_id, id, weekday, start_time, end_time")
      .in("provider_id", providerIds),
    supabase
      .from("provider_availability_overrides")
      .select("provider_id, id, date, is_unavailable, start_time, end_time, label")
      .in("provider_id", providerIds)
      .gte("date", today),
    supabase
      .from("provider_profiles")
      .select("user_id, vacation_mode, vacation_returns_on")
      .in("user_id", providerIds),
  ]);

  const rulesByProvider = new Map<string, WeeklyRule[]>();
  for (const r of allRules ?? []) {
    const list = rulesByProvider.get(r.provider_id) ?? [];
    list.push({ id: r.id, weekday: r.weekday, start_time: r.start_time, end_time: r.end_time } as WeeklyRule);
    rulesByProvider.set(r.provider_id, list);
  }
  const overridesByProvider = new Map<string, DateOverride[]>();
  for (const o of allOverrides ?? []) {
    const list = overridesByProvider.get(o.provider_id) ?? [];
    list.push({
      id: o.id, date: o.date, is_unavailable: o.is_unavailable,
      start_time: o.start_time, end_time: o.end_time, label: o.label,
    } as DateOverride);
    overridesByProvider.set(o.provider_id, list);
  }
  const vacByUser = new Map<string, { on: boolean; returnsOn: string | null }>();
  for (const p of allProfiles ?? []) {
    vacByUser.set(p.user_id, { on: p.vacation_mode ?? false, returnsOn: p.vacation_returns_on ?? null });
  }

  for (const id of providerIds) {
    const status = computeAvailabilityStatus(
      rulesByProvider.get(id) ?? [],
      overridesByProvider.get(id) ?? [],
      vacByUser.get(id) ?? { on: false, returnsOn: null },
    );
    out.set(id, status);
  }
  return out;
}

// Public read — service-role so we bypass the unauthenticated visitor's
// missing RLS context. Policy already restricts to approved providers.
export async function getProviderAvailability(providerId: string): Promise<{
  rules: WeeklyRule[];
  overrides: DateOverride[];
  vacation: { on: boolean; returnsOn: string | null };
}> {
  const supabase = createSupabaseServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: rules }, { data: overrides }, { data: pp }] = await Promise.all([
    supabase
      .from("provider_availability_rules")
      .select("id, weekday, start_time, end_time")
      .eq("provider_id", providerId)
      .order("weekday")
      .order("start_time"),
    supabase
      .from("provider_availability_overrides")
      .select("id, date, is_unavailable, start_time, end_time, label")
      .eq("provider_id", providerId)
      .gte("date", today)
      .order("date")
      .limit(50),
    supabase
      .from("provider_profiles")
      .select("vacation_mode, vacation_returns_on")
      .eq("user_id", providerId)
      .maybeSingle(),
  ]);

  return {
    rules: (rules ?? []) as WeeklyRule[],
    overrides: (overrides ?? []) as DateOverride[],
    vacation: { on: pp?.vacation_mode ?? false, returnsOn: pp?.vacation_returns_on ?? null },
  };
}
