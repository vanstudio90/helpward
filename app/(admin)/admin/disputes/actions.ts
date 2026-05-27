"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export async function resolveDisputeAction(
  disputeId: string, resolution: string, newStatus: "resolved" | "escalated" = "resolved"
) {
  await requireAdmin();
  const supabaseUser = await createSupabaseServerClient();
  const { data: { user } } = await supabaseUser.auth.getUser();

  const admin = createSupabaseServiceClient();
  await admin
    .from("disputes")
    .update({
      status: newStatus,
      resolution,
      resolved_by: user?.id ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", disputeId);

  await admin.from("audit_log").insert({
    actor_id: user?.id ?? null,
    action: `dispute.${newStatus}`,
    target_table: "disputes",
    target_id: disputeId,
    payload: { resolution },
  });

  revalidatePath("/admin/disputes");
}
