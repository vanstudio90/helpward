"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Kind = "provider" | "service" | "address";

export async function toggleFavoriteAction(kind: Kind, targetId: string): Promise<{ saved: boolean } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Check if exists
  const { data: existing } = await supabase
    .from("favorites")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("target_id", targetId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("kind", kind)
      .eq("target_id", targetId);
    revalidatePath("/favorites");
    revalidatePath("/saved-providers");
    revalidatePath("/services");
    return { saved: false };
  } else {
    await supabase
      .from("favorites")
      .insert({ user_id: user.id, kind, target_id: targetId });
    revalidatePath("/favorites");
    revalidatePath("/saved-providers");
    revalidatePath("/services");
    return { saved: true };
  }
}
