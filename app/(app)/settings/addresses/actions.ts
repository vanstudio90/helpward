"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateSavedAddress } from "@/lib/saved-addresses-pure";
import { geocodeAddress, isGeocodingEnabled } from "@/lib/geocode";

type State = { error?: string; success?: string } | undefined;

export async function createSavedAddressAction(formData: FormData): Promise<State> {
  const label = String(formData.get("label") ?? "");
  const formatted = String(formData.get("formatted") ?? "");
  const makeDefault = formData.get("make_default") === "1";

  const err = validateSavedAddress({ label, formatted });
  if (err) return { error: err };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  if (makeDefault) {
    // Clear any existing default first — partial unique index would reject
    // two true rows for the same user otherwise.
    await supabase
      .from("saved_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .eq("is_default", true);
  }

  // Geocode if we can — saved_addresses.lat + lng are nullable so a
  // pre-token environment still inserts the row, just without coords.
  // We pre-compute once at save time rather than every request submit so
  // the booking-creation path stays fast for the common "pick a saved
  // address" flow.
  let lat: number | null = null;
  let lng: number | null = null;
  let canonical = formatted.trim();
  if (isGeocodingEnabled()) {
    const g = await geocodeAddress(canonical);
    if (g) {
      lat = g.lat;
      lng = g.lng;
      canonical = g.formatted;
    }
  }

  const { error: insErr } = await supabase
    .from("saved_addresses")
    .insert({
      user_id: user.id,
      label: label.trim(),
      formatted: canonical,
      lat,
      lng,
      is_default: makeDefault,
    });
  if (insErr) return { error: insErr.message };

  revalidatePath("/settings");
  revalidatePath("/new-request");
  return { success: "Saved." };
}

export async function deleteSavedAddressAction(id: string): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("saved_addresses").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  revalidatePath("/new-request");
  return { success: "Removed." };
}

export async function setDefaultSavedAddressAction(id: string): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Clear existing default, then set the new one. Two-step so the partial
  // unique index never sees two true rows for the same user.
  await supabase
    .from("saved_addresses")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("is_default", true);

  const { error: upErr } = await supabase
    .from("saved_addresses")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (upErr) return { error: upErr.message };

  revalidatePath("/settings");
  revalidatePath("/new-request");
  return { success: "Default updated." };
}
