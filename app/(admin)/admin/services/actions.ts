"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type State = { error?: string; success?: string } | undefined;

export async function toggleServiceActiveAction(serviceId: string, active: boolean) {
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
