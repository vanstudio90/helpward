"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

type State = { error?: string; success?: string; photoId?: string } | undefined;

// Max 3 photos per booking — keeps storage modest and forces the helper to
// pick the few that genuinely prove the task is done rather than dumping a
// gallery. Customer attention is finite.
export const MAX_COMPLETION_PHOTOS = 3;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per photo — phones easily exceed this
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// Helper uploads a single proof-of-completion photo. The booking must be
// in_progress and the caller must be the assigned helper. We push the bytes
// via the service-role client (bucket is private) but verify ownership
// against the RLS-scoped session client first.
export async function uploadCompletionPhotoAction(
  bookingId: string,
  formData: FormData,
): Promise<State> {
  const file = formData.get("file");
  const caption = (formData.get("caption") as string | null)?.trim() || null;

  if (!(file instanceof File)) return { error: "No file attached." };
  if (file.size === 0) return { error: "File is empty." };
  if (file.size > MAX_BYTES) return { error: "Photo too large — max 8 MB." };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: "Unsupported file type — use JPEG, PNG, WebP, or HEIC." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Verify the caller is the assigned helper on an in-progress booking
  const { data: booking, error: bErr } = await supabase
    .from("bookings")
    .select("id, status, provider_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr || !booking) return { error: "Booking not found." };
  if (booking.provider_id !== user.id) return { error: "Not your booking." };
  if (booking.status !== "in_progress") {
    return { error: "Photos can only be added while the task is in progress." };
  }

  // Enforce the per-booking cap before spending the upload
  const { count } = await supabase
    .from("booking_completion_photos")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId);
  if ((count ?? 0) >= MAX_COMPLETION_PHOTOS) {
    return { error: `Limit reached — ${MAX_COMPLETION_PHOTOS} photos per booking.` };
  }

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${bookingId}/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  // Service-role push because the bucket is private and we want to avoid
  // signed-upload-URL round-trips for v1.
  const svc = createSupabaseServiceClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await svc.storage
    .from("booking-photos")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { error: "Upload failed: " + upErr.message };

  const { data: row, error: insErr } = await supabase
    .from("booking_completion_photos")
    .insert({
      booking_id: bookingId,
      uploaded_by_user_id: user.id,
      storage_path: path,
      caption,
      bytes: file.size,
      content_type: file.type,
    })
    .select("id")
    .single();

  if (insErr) {
    // Best-effort cleanup so we don't leak orphan objects
    await svc.storage.from("booking-photos").remove([path]);
    return { error: "Failed to register photo: " + insErr.message };
  }

  revalidatePath("/provider/active");
  revalidatePath(`/bookings/${bookingId}`);
  return { success: "Photo added.", photoId: row.id };
}

export async function deleteCompletionPhotoAction(photoId: string): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // Read the row first so we know which storage path to remove. RLS lets
  // the helper of an in-progress booking delete; if it returns nothing we
  // bail out with a friendly error rather than a 500.
  const { data: photo } = await supabase
    .from("booking_completion_photos")
    .select("id, booking_id, storage_path, uploaded_by_user_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: "Photo not found or already removed." };
  if (photo.uploaded_by_user_id !== user.id) return { error: "Not your photo." };

  const { error: delErr } = await supabase
    .from("booking_completion_photos")
    .delete()
    .eq("id", photoId);
  if (delErr) return { error: delErr.message };

  // Storage cleanup runs with service role; if the bucket delete fails the
  // row is already gone so we just log and move on (cron can sweep orphans).
  try {
    const svc = createSupabaseServiceClient();
    await svc.storage.from("booking-photos").remove([photo.storage_path]);
  } catch {}

  revalidatePath("/provider/active");
  revalidatePath(`/bookings/${photo.booking_id}`);
  return { success: "Removed." };
}
