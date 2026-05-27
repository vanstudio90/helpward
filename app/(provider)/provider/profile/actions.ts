"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type State = { error?: string; success?: string } | undefined;

export async function updateProviderProfileAction(
  _prev: State,
  formData: FormData
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const bio = String(formData.get("bio") ?? "").trim() || null;
  const radius = parseInt(String(formData.get("service_radius_km") ?? "20"), 10);
  const languages = String(formData.get("languages") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  if (radius < 1 || radius > 200) return { error: "Service radius must be 1-200 km." };

  const { error } = await supabase
    .from("provider_profiles")
    .update({ bio, service_radius_km: radius, languages })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/provider/profile");
  return { success: "Profile updated." };
}

export async function setProviderServicesAction(
  services: { id: string; custom_price_cents?: number | null }[]
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Replace the set: delete all then insert
  await supabase.from("provider_services").delete().eq("provider_id", user.id);
  if (services.length > 0) {
    const rows = services.map((s) => ({
      provider_id: user.id,
      service_id: s.id,
      custom_price_cents: s.custom_price_cents ?? null,
    }));
    const { error } = await supabase.from("provider_services").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/provider/profile");
  revalidatePath("/provider/onboard");
  return { success: `Saved ${services.length} service${services.length === 1 ? "" : "s"}.` };
}

const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function uploadProviderAvatarAction(
  _prev: State,
  formData: FormData
): Promise<State> {
  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) return { error: "Please pick a file." };
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) return { error: "Use JPEG, PNG, WEBP or GIF." };
  if (file.size > MAX_AVATAR_BYTES) return { error: "Max 5 MB." };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, buffer, { contentType: file.type, cacheControl: "3600", upsert: false });
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
