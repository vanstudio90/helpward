"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

type State = { error?: string; success?: string } | undefined;

const PERMISSIONS = ["allowed", "refused", "unknown"] as const;
type Permission = (typeof PERMISSIONS)[number];

function perm(v: FormDataEntryValue | null): Permission {
  const s = String(v ?? "unknown");
  return (PERMISSIONS as readonly string[]).includes(s) ? (s as Permission) : "unknown";
}

/*
 * Record what a venue actually said about stand-ins.
 *
 * Every answer other than "unknown" is stamped with who recorded it and
 * when. The table enforces that too — a permission with no attribution is
 * a rumour, and the whole point of this directory is that a later reader
 * can tell a checked fact from a guess, and re-check one that has gone
 * stale.
 */
export async function saveVenueAction(_prev: State, formData: FormData): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") return { error: "Admins only." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "The venue needs a name." };
  if (name.length > 120) return { error: "That name is too long." };

  const country = String(formData.get("country") ?? "");
  if (!["US", "CA"].includes(country)) return { error: "Pick a country." };

  const substitutes = perm(formData.get("substitutes_allowed"));
  const replace = perm(formData.get("customer_may_replace"));
  const fullParty = perm(formData.get("full_party_required"));
  const numbers = perm(formData.get("numbers_transferable"));

  const anyAnswered = [substitutes, replace, fullParty, numbers].some((p) => p !== "unknown");

  const row = {
    name,
    address: String(formData.get("address") ?? "").trim() || null,
    city: String(formData.get("city") ?? "").trim() || null,
    region: String(formData.get("region") ?? "").trim() || null,
    country,
    area_id: String(formData.get("area_id") ?? "").trim() || null,
    substitutes_allowed: substitutes,
    customer_may_replace: replace,
    full_party_required: fullParty,
    numbers_transferable: numbers,
    early_turn_policy: String(formData.get("early_turn_policy") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    // Only stamped when something was actually answered, so "unknown"
    // rows don't masquerade as checked ones.
    confirmed_by: anyAnswered ? user.id : null,
    confirmed_at: anyAnswered ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const id = String(formData.get("id") ?? "").trim();
  const db = createSupabaseServiceClient();
  const { error } = id
    ? await db.from("venues").update(row).eq("id", id)
    : await db.from("venues").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/admin/venues");
  return { success: id ? `Updated ${name}.` : `Added ${name}.` };
}

export async function deleteVenueAction(id: string): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") return { error: "Admins only." };

  const { error } = await createSupabaseServiceClient().from("venues").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/venues");
  return { success: "Removed." };
}

/* ================================================================== */
/* THE REVIEWED PATH                                                  */
/* ================================================================== */
/*
  The two actions above are the working form: they write straight
  through with the service key. The ones below are the console's path —
  the admin claim is checked in the database, an answer needs a source,
  a write against a row somebody else moved is refused, and every
  change writes its own audit event.
*/

/*
  RECORDING A VENUE, AND RECORDING WHAT IT SAID.

  checkVenue() reads these rows on every Wait in Line request, so a
  change here changes what strangers are allowed to buy. Both of these
  go through a database function that checks the admin claim itself,
  refuses an answer with no source, refuses a write against a row
  somebody else has moved, and writes its own audit event.

  NOTHING HERE CANCELS ANYTHING. Recording a refusal returns the number
  of open requests that name the venue so operations can look at them.
  A settings panel does not get to cancel work somebody has paid for.
*/

export type VenueResult =
  | { ok: true; message: string; detail?: string; id?: string }
  | { ok: false; error: string; conflict?: boolean };

type PgError = { message?: string; code?: string } | null;

function fail(error: PgError): VenueResult {
  const message = (error?.message ?? "The change could not be saved.")
    .replace(/^[^:]*:\s*/, "")
    .trim();
  switch (error?.code) {
    case "42501": return { ok: false, error: "You are not permitted to change venue records." };
    case "HW080": return { ok: false, error: message, conflict: true };
    case "HW100": return { ok: false, error: "A venue needs a name — it is what the customer types when booking." };
    case "HW101": return { ok: false, error: "Country must be CA or US." };
    case "HW102": return { ok: false, error: message };
    case "HW103": return { ok: false, error: "That venue no longer exists. Reload the register." };
    case "HW104": return { ok: false, error: "An answer is allowed, refused, or unknown. Nothing else." };
    case "HW105": return { ok: false, error: message };
    case "HW106": return { ok: false, error: "Nothing changed, so nothing was recorded." };
    case "HW107": return { ok: false, error: message };
    default: return { ok: false, error: error?.message ?? "The change could not be saved." };
  }
}

export async function createVenueAction(input: {
  name: string;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: "CA" | "US" | null;
  areaId?: string | null;
  notes?: string | null;
}): Promise<VenueResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_venue_create", {
    p_name: input.name,
    p_address: input.address ?? null,
    p_city: input.city ?? null,
    p_region: input.region ?? null,
    p_country: input.country ?? null,
    p_area_id: input.areaId ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) return fail(error);
  const result = data as { id: string; note: string };
  revalidatePath("/admin/venues");
  return {
    ok: true,
    id: result.id,
    message: "Venue recorded.",
    /* Creating a venue is recording that a place exists. It is not a
       claim that anybody has asked them anything. */
    detail: result.note,
  };
}

export async function setVenuePermissionsAction(
  id: string,
  expectedUpdatedAt: string | null,
  answers: {
    substitutesAllowed: string;
    customerMayReplace: string;
    fullPartyRequired: string;
    numbersTransferable: string;
  },
  source: string,
  reason?: string | null,
  earlyTurnPolicy?: string | null,
): Promise<VenueResult> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_venue_set_permissions", {
    p_id: id,
    p_expected: expectedUpdatedAt,
    p_substitutes_allowed: answers.substitutesAllowed,
    p_customer_may_replace: answers.customerMayReplace,
    p_full_party_required: answers.fullPartyRequired,
    p_numbers_transferable: answers.numbersTransferable,
    p_source: source,
    p_reason: reason ?? null,
    p_early_turn_policy: earlyTurnPolicy ?? null,
  });
  if (error) return fail(error);
  const result = data as {
    fields_changed: number; open_requests_at_venue: number;
    confirmed: boolean; note: string;
  };
  revalidatePath("/admin/venues");
  return {
    ok: true,
    message: `Recorded — ${result.fields_changed} answer${result.fields_changed === 1 ? "" : "s"} changed.`,
    detail: result.note,
  };
}
