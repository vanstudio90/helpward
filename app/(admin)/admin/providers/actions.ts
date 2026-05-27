"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export async function approveProviderAction(providerId: string) {
  await requireAdmin();
  // Audit who approved
  const supabaseUser = await createSupabaseServerClient();
  const { data: { user } } = await supabaseUser.auth.getUser();

  const admin = createSupabaseServiceClient();
  await admin
    .from("provider_profiles")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user?.id ?? null,
    })
    .eq("user_id", providerId);

  await admin.from("notifications").insert({
    user_id: providerId,
    type: "provider_approved",
    payload: {},
  });

  await admin.from("audit_log").insert({
    actor_id: user?.id ?? null,
    action: "provider.approve",
    target_table: "provider_profiles",
    target_id: providerId,
  });

  revalidatePath("/admin/providers");
}

export async function rejectProviderAction(providerId: string, reason?: string) {
  await requireAdmin();
  const supabaseUser = await createSupabaseServerClient();
  const { data: { user } } = await supabaseUser.auth.getUser();

  const admin = createSupabaseServiceClient();
  await admin
    .from("provider_profiles")
    .update({
      status: "suspended",
      rejection_reason: reason ?? "Did not meet platform requirements",
    })
    .eq("user_id", providerId);

  await admin.from("notifications").insert({
    user_id: providerId,
    type: "provider_rejected",
    payload: { reason: reason ?? null },
  });

  await admin.from("audit_log").insert({
    actor_id: user?.id ?? null,
    action: "provider.reject",
    target_table: "provider_profiles",
    target_id: providerId,
    payload: { reason: reason ?? null },
  });

  revalidatePath("/admin/providers");
}
