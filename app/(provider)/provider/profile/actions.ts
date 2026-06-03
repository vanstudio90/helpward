"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateSlug } from "@/lib/slug";

type State = { error?: string; success?: string } | undefined;

// Helper picks a custom slug for their public profile URL. RLS lets them
// update their own row; the unique partial index on (slug) where slug is
// not null catches collisions cleanly with a Postgres 23505 we surface
// back as a friendly "already taken" message.
// Update the helpers stored timezone (used by analytics + future schedule
// surfaces). Validates against Intl.supportedValuesOf("timeZone") so we
// dont store junk like "PST" or arbitrary user input.
export async function setProviderTimezoneAction(
  timezone: string,
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  if (typeof timezone !== "string" || timezone.length === 0 || timezone.length > 60) {
    return { error: "Invalid timezone." };
  }
  // Verify the tz is one Intl actually recognizes — same posture as the
  // browser's Intl.DateTimeFormat would reject. List is large (~400) but
  // includes() is plenty fast for a one-shot validation.
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (supported && !supported.includes(timezone)) {
      return { error: "Unrecognized timezone." };
    }
  } catch { /* runtime too old for supportedValuesOf — accept and let DB store it */ }

  const { error } = await supabase
    .from("provider_profiles")
    .update({ timezone })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/provider/profile");
  revalidatePath("/provider/analytics");
  return { success: `Timezone set to ${timezone}.` };
}

export async function setProviderSlugAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const raw = String(formData.get("slug") ?? "").trim().toLowerCase();
  const err = validateSlug(raw);
  if (err) return { error: err };

  const { error } = await supabase
    .from("provider_profiles")
    .update({ slug: raw })
    .eq("user_id", user.id);
  if (error) {
    if (error.code === "23505") return { error: "That slug is already taken." };
    return { error: error.message };
  }

  revalidatePath("/provider/profile");
  revalidatePath(`/providers/${raw}`);
  return { success: `Your profile URL is now /providers/${raw}.` };
}

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
  if (bio && bio.length > 2000) return { error: "Bio is too long (max 2000 chars)." };
  if (languages.length > 10) return { error: "Too many languages (max 10)." };
  if (languages.some((l) => l.length > 40)) return { error: "Language names too long." };

  const { error } = await supabase
    .from("provider_profiles")
    .update({ bio, service_radius_km: radius, languages })
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/provider/profile");
  revalidatePath(`/providers/${user.id}`);
  return { success: "Profile updated." };
}

export async function setProviderServicesAction(
  services: { id: string; custom_price_cents?: number | null }[]
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Replace the set safely: upsert first (so insert failures don't wipe
  // existing rows), THEN delete only rows the provider dropped. The naive
  // delete-then-insert pattern can leave a provider with zero services if
  // the insert errors mid-flight.
  if (services.length > 0) {
    const rows = services.map((s) => ({
      provider_id: user.id,
      service_id: s.id,
      custom_price_cents: s.custom_price_cents ?? null,
    }));
    const { error: upErr } = await supabase
      .from("provider_services")
      .upsert(rows, { onConflict: "provider_id,service_id" });
    if (upErr) return { error: upErr.message };
  }

  const { data: existing } = await supabase
    .from("provider_services")
    .select("service_id")
    .eq("provider_id", user.id);
  const keep = new Set(services.map((s) => s.id));
  const toDelete = (existing ?? []).map((r) => r.service_id).filter((id) => !keep.has(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from("provider_services")
      .delete()
      .eq("provider_id", user.id)
      .in("service_id", toDelete);
    if (delErr) return { error: delErr.message };
  }

  revalidatePath("/provider/profile");
  revalidatePath("/provider/onboard");
  revalidatePath(`/providers/${user.id}`);
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
