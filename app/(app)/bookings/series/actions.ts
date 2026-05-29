"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  type Cadence, nextOccurrenceDate, occurrenceToISOAtTimezone,
} from "@/lib/recurrence-pure";

type State = { error?: string; success?: string; seriesId?: string } | undefined;

// Create a new recurring series. Validates the rule, snapshots service
// price, creates the booking_series row, and materialises the FIRST
// occurrence immediately so the customer sees a real upcoming request
// without waiting for the cron.
export async function createSeriesAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const serviceId = String(formData.get("service_id") ?? "");
  const cadence = String(formData.get("cadence") ?? "") as Cadence;
  const weekdayRaw = formData.get("weekday");
  const dayOfMonthRaw = formData.get("day_of_month");
  const timeOfDay = String(formData.get("time_of_day") ?? "");
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "").trim() || null;
  const maxOccurrencesRaw = formData.get("max_occurrences");
  const addressText = String(formData.get("address") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const timezone = String(formData.get("timezone") ?? "America/Vancouver");

  if (!["weekly", "biweekly", "monthly"].includes(cadence)) return { error: "Pick a cadence." };
  if (!/^\d{2}:\d{2}$/.test(timeOfDay)) return { error: "Pick a time." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "Pick a start date." };

  let weekday: number | null = null;
  let dayOfMonth: number | null = null;
  if (cadence === "weekly" || cadence === "biweekly") {
    weekday = weekdayRaw == null ? NaN : Number(weekdayRaw);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "Pick a weekday." };
  } else {
    dayOfMonth = dayOfMonthRaw == null ? NaN : Number(dayOfMonthRaw);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return { error: "Pick a day of the month." };
  }

  const maxOccurrences = maxOccurrencesRaw ? Number(maxOccurrencesRaw) : null;
  if (maxOccurrences != null && (!Number.isInteger(maxOccurrences) || maxOccurrences < 1 || maxOccurrences > 520)) {
    return { error: "Max occurrences must be between 1 and 520." };
  }
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { error: "End date is invalid." };
  if (endDate && endDate < startDate) return { error: "End date must be after start date." };
  if (!addressText) return { error: "Pick an address." };
  if (addressText.length > 300) return { error: "Address is too long (max 300 chars)." };
  if (notes && notes.length > 1000) return { error: "Notes are too long (max 1000 chars)." };

  // Snapshot service so price changes don't retroactively reprice.
  const { data: service } = await supabase
    .from("services")
    .select("id, base_price_cents")
    .eq("id", serviceId)
    .eq("active", true)
    .maybeSingle();
  if (!service) return { error: "Service isn't available." };

  // Address creation reuses the same fake-Vancouver POINT until Mapbox lands.
  const { data: address, error: addrErr } = await supabase
    .from("addresses")
    .insert({
      user_id: user.id,
      formatted: addressText,
      location: "POINT(-123.1207 49.2827)" as unknown as string,
      country: "US",
    })
    .select()
    .single();
  if (addrErr || !address) return { error: addrErr?.message ?? "Couldn't save the address." };

  const { data: series, error: serErr } = await supabase
    .from("booking_series")
    .insert({
      customer_id: user.id,
      service_id: service.id,
      pickup_address_id: address.id,
      cadence,
      weekday,
      day_of_month: dayOfMonth,
      time_of_day: `${timeOfDay}:00`,
      timezone,
      estimated_price_cents: service.base_price_cents,
      estimated_duration_min: 45,
      notes,
      start_date: startDate,
      end_date: endDate,
      max_occurrences: maxOccurrences,
      status: "active",
    })
    .select()
    .single();
  if (serErr || !series) return { error: serErr?.message ?? "Couldn't create the series." };

  // Materialise the first occurrence immediately. If it fails we keep the
  // series — the cron will pick it up.
  await materialiseNextOccurrence(series.id);

  revalidatePath("/bookings");
  return { success: "Recurring series created.", seriesId: series.id };
}

// Pause / resume / cancel — single-state mutations with audit log entries
// so an admin can later see why a series stopped if a customer complains.
export async function pauseSeriesAction(seriesId: string): Promise<State> {
  return setSeriesStatus(seriesId, "paused");
}

export async function resumeSeriesAction(seriesId: string): Promise<State> {
  return setSeriesStatus(seriesId, "active");
}

export async function cancelSeriesAction(seriesId: string): Promise<State> {
  return setSeriesStatus(seriesId, "cancelled");
}

async function setSeriesStatus(
  seriesId: string,
  status: "active" | "paused" | "cancelled",
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "paused") update.paused_at = new Date().toISOString();
  if (status === "active") update.paused_at = null;
  if (status === "cancelled") update.cancelled_at = new Date().toISOString();

  const { error } = await supabase
    .from("booking_series")
    .update(update)
    .eq("id", seriesId)
    .eq("customer_id", user.id);
  if (error) return { error: error.message };

  // Audit trail
  await supabase.from("audit_log").insert({
    actor_id: user.id,
    action: `series.${status}`,
    target_table: "booking_series",
    target_id: seriesId,
  });

  revalidatePath("/bookings");
  revalidatePath(`/bookings/series/${seriesId}`);
  return { success: `Series ${status === "active" ? "resumed" : status}.` };
}

// Skip the next-due occurrence — cancels its pending request if it's been
// materialised, and bumps the series' "skip until" date forward. Simpler
// version: just cancel the pending request; cron picks the next slot.
export async function skipNextOccurrenceAction(seriesId: string): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Cancel the soonest still-matching request for this series.
  const { data: req } = await supabase
    .from("requests")
    .select("id, status")
    .eq("series_id", seriesId)
    .eq("customer_id", user.id)
    .in("status", ["draft", "matching"])
    .order("scheduled_for", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!req) return { error: "No upcoming occurrence to skip." };

  const { error } = await supabase.rpc("cancel_request", { p_request_id: req.id });
  if (error) return { error: error.message };

  revalidatePath("/bookings");
  revalidatePath(`/bookings/series/${seriesId}`);
  return { success: "Next occurrence skipped." };
}

// =========================================================================
// Materialisation — shared by createSeriesAction and the daily cron.
// =========================================================================

// Materialise the next occurrence for ONE series. Idempotent: the unique
// index on (series_id, series_occurrence_date) prevents double-creation.
// Returns the new request id, or null if there's nothing to schedule.
export async function materialiseNextOccurrence(seriesId: string): Promise<string | null> {
  const admin = createSupabaseServiceClient();
  const { data: series } = await admin
    .from("booking_series")
    .select("*")
    .eq("id", seriesId)
    .single();
  if (!series || series.status !== "active") return null;

  // Confirm service is still active — if a previously valid service was
  // removed from the catalogue, pause the series and notify.
  const { data: service } = await admin
    .from("services")
    .select("id, base_price_cents")
    .eq("id", series.service_id)
    .eq("active", true)
    .maybeSingle();
  if (!service) {
    await admin
      .from("booking_series")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", series.id);
    await admin.from("notifications").insert({
      user_id: series.customer_id,
      type: "series_paused_service_unavailable",
      payload: { series_id: series.id, service_id: series.service_id },
    });
    return null;
  }

  const after = new Date();
  const nextDate = nextOccurrenceDate(
    {
      cadence: series.cadence,
      weekday: series.weekday ?? undefined,
      dayOfMonth: series.day_of_month ?? undefined,
      timeOfDay: typeof series.time_of_day === "string" ? series.time_of_day.slice(0, 5) : "09:00",
      startDate: series.start_date,
      endDate: series.end_date,
      maxOccurrences: series.max_occurrences,
    },
    after,
    series.occurrences_created,
  );

  if (!nextDate) {
    // Series completed — flip status so we stop checking it.
    await admin
      .from("booking_series")
      .update({ status: "completed" })
      .eq("id", series.id);
    return null;
  }

  // Build the timestamptz for scheduled_for in the customer's local tz.
  const scheduledForIso = occurrenceToISOAtTimezone(
    nextDate,
    typeof series.time_of_day === "string" ? series.time_of_day.slice(0, 5) : "09:00",
    series.timezone,
  );

  const { data: req, error } = await admin
    .from("requests")
    .insert({
      customer_id: series.customer_id,
      service_id: service.id,
      pickup_address_id: series.pickup_address_id,
      scheduled_for: scheduledForIso,
      notes: series.notes,
      estimated_price_cents: series.estimated_price_cents,
      estimated_duration_min: series.estimated_duration_min,
      status: "matching",
      series_id: series.id,
      series_occurrence_date: nextDate,
    })
    .select("id")
    .single();
  if (error) {
    // 23505 = unique violation — the occurrence was already created (e.g.
    // by a previous cron run). Safe to ignore.
    if (error.code === "23505") return null;
    console.error("materialiseNextOccurrence insert failed:", error.message);
    return null;
  }

  await admin
    .from("booking_series")
    .update({
      occurrences_created: series.occurrences_created + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", series.id);

  // Best-effort broadcast — same as the one-shot new-request flow.
  await admin.rpc("broadcast_request", { p_request_id: req.id, p_radius_km: 20 }).catch((e) => {
    console.error("broadcast_request from series failed:", e);
  });

  return req.id;
}
