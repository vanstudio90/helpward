"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateSavedAddress } from "@/lib/saved-addresses-pure";

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

  const { error: insErr } = await supabase
    .from("saved_addresses")
    .insert({
      user_id: user.id,
      label: label.trim(),
      formatted: formatted.trim(),
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
