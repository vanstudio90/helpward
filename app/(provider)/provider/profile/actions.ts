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
  serviceIds: string[]
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Replace the set: delete all then insert
  await supabase.from("provider_services").delete().eq("provider_id", user.id);
  if (serviceIds.length > 0) {
    const rows = serviceIds.map((id) => ({ provider_id: user.id, service_id: id }));
    const { error } = await supabase.from("provider_services").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/provider/profile");
  revalidatePath("/provider/onboard");
  return { success: `Saved ${serviceIds.length} service${serviceIds.length === 1 ? "" : "s"}.` };
}
