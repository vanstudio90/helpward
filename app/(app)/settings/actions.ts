"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type State = { error?: string; success?: string } | undefined;

const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

export async function setNotificationPrefAction(
  key: "push_booking" | "push_messages" | "email_receipts" | "email_digest" | "sms_critical",
  value: boolean
): Promise<{ error?: string } | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase
    .from("notification_prefs")
    .update({ [key]: value })
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  return undefined;
}

export async function setAppPrefAction(
  key: "dark_mode" | "save_searches" | "auto_select" | "in_app_sounds",
  value: boolean
): Promise<{ error?: string } | undefined> {
  // App prefs are client-only (browser localStorage) — server action is a noop
  // returning success so the UI can update without a DB round-trip. Kept here
  // to make future server-persisted prefs trivial to wire.
  void key; void value;
  return undefined;
}

export async function uploadAvatarAction(
  _prev: State,
  formData: FormData
): Promise<State> {
  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) return { error: "Please pick a file." };
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return { error: "Use JPEG, PNG, WEBP or GIF." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Max 5 MB." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error: profErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (profErr) return { error: profErr.message };

  revalidatePath("/", "layout");
  return { success: "Avatar updated." };
}

export async function updateProfileAction(
  _prev: State,
  formData: FormData
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "US");
  const default_currency = country === "CA" ? "CAD" : "USD";

  if (!full_name) return { error: "Name can't be empty." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, phone, country, default_currency, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: "Profile updated." };
}
