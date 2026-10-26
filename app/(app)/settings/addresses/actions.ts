"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { validateSavedAddress } from "@/lib/saved-addresses-pure";
import { resolveDispatchableAddress } from "@/lib/dispatch-guard";

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

  // Verify at save time, and refuse anything we can't geocode or don't
  // serve. This used to geocode best-effort and save the raw text on
  // failure, which is how free text like "QA TEST — DO NOT DISPATCH" became
  // a saved address that then filled and submitted a real request.
  const guard = await resolveDispatchableAddress({
    text: formatted.trim(), client: supabase, userId: user.id,
    confirmationToken: String(formData.get("address_confirmation") ?? "") || null,
  });
  if (!guard.ok) return { error: guard.error };

  // Service client: geocode_verified is a server attestation that the
  // authenticated client is forbidden from setting (migration 0036), so an
  // insert through the ordinary client would silently store an unverified
  // saved address.
  const { error: insErr } = await createSupabaseServiceClient()
    .from("saved_addresses")
    .insert({
      user_id: user.id,
      label: label.trim(),
      formatted: guard.address.formatted,
      lat: guard.address.lat,
      lng: guard.address.lng,
      city: guard.address.city,
      region: guard.address.region,
      country: guard.address.country,
      geocode_verified: true,
      geocoded_at: new Date().toISOString(),
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
