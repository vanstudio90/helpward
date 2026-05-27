"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function toggleServiceActiveAction(serviceId: string, active: boolean) {
  const supabase = createSupabaseServiceClient();
  await supabase.from("services").update({ active }).eq("id", serviceId);
  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/new-request");
}
