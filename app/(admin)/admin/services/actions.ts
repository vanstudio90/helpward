"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

type State = { error?: string; success?: string } | undefined;

export async function toggleServiceActiveAction(serviceId: string, active: boolean) {
  await requireAdmin();
  const supabase = createSupabaseServiceClient();
  await supabase.from("services").update({ active }).eq("id", serviceId);
  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/new-request");
}

export async function createServiceAction(
  _prev: State,
  formData: FormData
): Promise<State> {
  const id = String(formData.get("id") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const category_id = String(formData.get("category_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const blurb = String(formData.get("blurb") ?? "").trim();
  const base_price_dollars = parseFloat(String(formData.get("base_price") ?? "0"));
  const eta_label = String(formData.get("eta_label") ?? "").trim() || null;
  const image_url = String(formData.get("image_url") ?? "").trim() || null;
  const popular = formData.get("popular") === "on";

  if (!id || !title || !blurb || !category_id) return { error: "All fields are required." };
  if (!base_price_dollars || base_price_dollars <= 0) return { error: "Price must be > 0." };
  if (id.length > 60) return { error: "Slug too long (max 60 chars)." };
  if (title.length > 80) return { error: "Title too long (max 80 chars)." };
  if (blurb.length > 400) return { error: "Blurb too long (max 400 chars)." };
  if (eta_label && eta_label.length > 40) return { error: "ETA label too long." };
  if (image_url && !/^https:\/\//.test(image_url)) return { error: "Image URL must start with https://" };
  if (image_url && image_url.length > 500) return { error: "Image URL too long." };

  try {
    await requireAdmin();
  } catch {
    return { error: "Forbidden." };
  }
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from("services").insert({
    id, category_id, title, blurb,
    base_price_cents: Math.round(base_price_dollars * 100),
    eta_label, image_url, popular, active: true,
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/new-request");
  return { success: `${title} added.` };
}
