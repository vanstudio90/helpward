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
