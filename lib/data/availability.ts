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
