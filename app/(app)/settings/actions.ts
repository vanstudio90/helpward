"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

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
  if (full_name.length > 80) return { error: "Name is too long (max 80 chars)." };
  if (phone && phone.length > 30) return { error: "Phone is too long." };
  if (!["US", "CA"].includes(country)) return { error: "Country must be US or CA." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name, phone, country, default_currency, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: "Profile updated." };
}

// =========================================================================
// CCPA / PIPEDA / GDPR — data export + account deletion
// =========================================================================

// Queue a full-archive export of the user's Helpward data. The actual archive
// is assembled by a background job (admin queue page in this round; cron in
// a follow-up). Returns ok if a new request was queued or one was already
// in flight — we don't let users spam-queue more than one pending request.
type DataState = { error?: string; success?: string; pending?: boolean } | undefined;

export async function requestDataExportAction(): Promise<DataState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const admin = createSupabaseServiceClient();

  // Existing-pending check so the button can flip to "Already queued" instead
  // of stacking 50 export rows when an impatient user mashes it.
  const { data: existing } = await admin
    .from("data_export_requests")
    .select("id, status, requested_at")
    .eq("user_id", user.id)
    .in("status", ["pending", "processing"])
    .limit(1)
    .maybeSingle();
  if (existing) return { success: "An export is already in progress — we'll email it within 48 hours.", pending: true };

  // Audit context — useful when investigating abuse / impersonation.
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? null;
  const ua = h.get("user-agent")?.slice(0, 200) ?? null;

  const { error } = await admin.from("data_export_requests").insert({
    user_id: user.id, status: "pending", ip, user_agent: ua,
  });
  if (error) return { error: error.message };

  await admin.from("audit_log").insert({
    actor_id: user.id, action: "user.data_export_requested",
    target_table: "data_export_requests", target_id: user.id,
  });

  revalidatePath("/settings");
  revalidatePath("/admin");
  return { success: "Export queued — we'll email a download link within 48 hours.", pending: true };
}

// Schedule the user's account for deletion after a 30-day grace period.
// The user can cancel by signing back in and tapping Undo from /settings.
// We don't immediately destroy data — gives users time to change their mind
// and gives admin a window to retain anything legally required.
export async function requestAccountDeletionAction(
  _prev: DataState,
  formData: FormData,
): Promise<DataState> {
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || null;
  const confirm = String(formData.get("confirm") ?? "").trim();

  if (confirm !== "DELETE") {
    return { error: 'Type "DELETE" exactly to confirm.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const admin = createSupabaseServiceClient();
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? null;
  const ua = h.get("user-agent")?.slice(0, 200) ?? null;

  // The unique partial index prevents two pending rows per user — so we
  // upsert by user_id+status.
  const { data: existing } = await admin
    .from("account_deletion_requests")
    .select("id, grace_until")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { success: `Already scheduled. Your account is removed on ${new Date(existing.grace_until).toLocaleDateString()}. Sign back in within that window to cancel.`, pending: true };
  }

  const { data: row, error } = await admin
    .from("account_deletion_requests")
    .insert({ user_id: user.id, reason, status: "pending", ip, user_agent: ua })
    .select("grace_until")
    .single();
  if (error) return { error: error.message };

  await admin.from("audit_log").insert({
    actor_id: user.id, action: "user.deletion_requested",
    target_table: "account_deletion_requests", target_id: user.id,
    payload: { reason_provided: !!reason },
  });

  revalidatePath("/settings");
  revalidatePath("/admin");
  return {
    success: `Your account will be deleted on ${new Date(row.grace_until).toLocaleDateString()}. Sign back in within that window to cancel.`,
    pending: true,
  };
}

export async function cancelAccountDeletionAction(): Promise<DataState> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // RLS lets the user update their own pending row to cancelled.
  const { error } = await supabase
    .from("account_deletion_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) return { error: error.message };

  const admin = createSupabaseServiceClient();
  await admin.from("audit_log").insert({
    actor_id: user.id, action: "user.deletion_cancelled",
    target_table: "account_deletion_requests", target_id: user.id,
  });

  revalidatePath("/settings");
  revalidatePath("/admin");
  return { success: "Account deletion cancelled — your data is safe." };
}
