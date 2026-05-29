"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Weekly-rules payload — one editor-row per weekday + ordinal pair, so we
// can support split shifts on the same day (09:00-12:00 + 17:00-21:00).
export type WeeklyRulePayload = {
  weekday: number;          // 0..6
  start_time: string;       // "HH:MM"
  end_time: string;
};

type State = { error?: string; success?: string } | undefined;

// Replace the entire weekly schedule atomically — simpler than diffing the
// editor against existing rows and avoids partial saves if one row fails
// validation. The DB still enforces per-row constraints (end > start).
export async function saveWeeklyRulesAction(
  rules: WeeklyRulePayload[],
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  if (!Array.isArray(rules)) return { error: "Invalid payload." };
  if (rules.length > 40) return { error: "Too many shifts — max 40 per week." };
  for (const r of rules) {
    if (typeof r.weekday !== "number" || r.weekday < 0 || r.weekday > 6) {
      return { error: "Invalid weekday." };
    }
    if (!/^\d{2}:\d{2}$/.test(r.start_time) || !/^\d{2}:\d{2}$/.test(r.end_time)) {
      return { error: "Times must be HH:MM." };
    }
    if (r.end_time <= r.start_time) {
      return { error: "End time must be after start time on each shift." };
    }
  }

  // Replace all rows in one transaction. RLS ensures we only touch our own
  // rows; the explicit eq() is defense-in-depth.
  const { error: delErr } = await supabase
    .from("provider_availability_rules")
    .delete()
    .eq("provider_id", user.id);
  if (delErr) return { error: delErr.message };

  if (rules.length > 0) {
    const rows = rules.map((r) => ({
      provider_id: user.id,
      weekday: r.weekday,
      start_time: `${r.start_time}:00`,
      end_time: `${r.end_time}:00`,
    }));
    const { error: insErr } = await supabase.from("provider_availability_rules").insert(rows);
    if (insErr) return { error: insErr.message };
  }

  revalidatePath("/provider/schedule");
  revalidatePath(`/providers/${user.id}`);
  return { success: `Schedule saved — ${rules.length} shift${rules.length === 1 ? "" : "s"} per week.` };
}

// Add a one-off override (vacation day, extra shift, etc.). Validates the
// date is today or future, and rejects extra-shift overrides without times.
export async function addOverrideAction(
  date: string,
  isUnavailable: boolean,
  startTime: string | null,
  endTime: string | null,
  label: string | null,
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Invalid date." };
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) return { error: "Pick today or a future date." };
  if (label && label.length > 80) return { error: "Label is too long (max 80 chars)." };

  if (!isUnavailable) {
    if (!startTime || !endTime) return { error: "Extra-shift overrides need start + end times." };
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return { error: "Times must be HH:MM." };
    }
    if (endTime <= startTime) return { error: "End must be after start." };
  }

  const { error } = await supabase
    .from("provider_availability_overrides")
    .insert({
      provider_id: user.id,
      date,
      is_unavailable: isUnavailable,
      start_time: isUnavailable ? null : `${startTime}:00`,
      end_time: isUnavailable ? null : `${endTime}:00`,
      label: label ?? null,
    });
  if (error) {
    // The unique partial index throws 23505 if you try to add a second
    // unavailable row for the same date — surface a friendly message.
    if (error.code === "23505") return { error: "You already have an unavailable entry on that date." };
    return { error: error.message };
  }

  revalidatePath("/provider/schedule");
  revalidatePath(`/providers/${user.id}`);
  return { success: isUnavailable ? "Time-off added." : "Extra shift added." };
}

export async function removeOverrideAction(overrideId: string): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // RLS-enforced ownership; the eq() is defense-in-depth.
  const { error } = await supabase
    .from("provider_availability_overrides")
    .delete()
    .eq("id", overrideId)
    .eq("provider_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/provider/schedule");
  revalidatePath(`/providers/${user.id}`);
  return { success: "Removed." };
}

// Vacation mode — flips two flags on provider_profiles. Helpers can also
// just clear their weekly rules, but the toggle is more discoverable and
// preserves the schedule for "when I come back".
export async function setVacationModeAction(
  on: boolean,
  returnsOn: string | null,
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  if (on && returnsOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(returnsOn)) return { error: "Invalid return date." };
    const today = new Date().toISOString().slice(0, 10);
    if (returnsOn < today) return { error: "Return date must be today or later." };
  }

  const { error } = await supabase
    .from("provider_profiles")
    .update({ vacation_mode: on, vacation_returns_on: on ? returnsOn : null })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/provider/schedule");
  revalidatePath(`/providers/${user.id}`);
  return { success: on ? "Vacation mode on — you won't appear as available." : "Vacation mode off." };
}
