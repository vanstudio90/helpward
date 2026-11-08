import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  MAX_COMPLETION_PHOTOS,
  COMPLETION_PHOTO_MAX_BYTES,
  COMPLETION_PHOTO_ALLOWED_TYPES,
} from "@/lib/completion-photo-pure";

/*
  PROOF THAT THE JOB WAS DONE.

  Shared by the website's server action and /api/v1/helper, for the same
  reason accepting and completing are: the bucket is PRIVATE, so the
  bytes go up with the service-role client, and nothing on a phone holds
  that key.

  The ownership checks deliberately run against the CALLER'S client, not
  the service one. The service key would satisfy every policy, so using
  it to decide whether this helper may touch this booking would be
  checking a lock with the master key in hand. It is used for the
  storage write and for nothing else.
*/

export type PhotoResult =
  | { ok: true; photoId: string }
  | { ok: false; error: string };

export async function addCompletionPhoto(
  supabase: SupabaseClient,
  userId: string,
  bookingId: string,
  file: { bytes: Uint8Array; contentType: string; filename: string; caption?: string | null },
): Promise<PhotoResult> {
  if (file.bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (file.bytes.byteLength > COMPLETION_PHOTO_MAX_BYTES) {
    return { ok: false, error: "Photo too large — max 8 MB." };
  }
  if (!(COMPLETION_PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.contentType)) {
    return { ok: false, error: "Unsupported file type — use JPEG, PNG, WebP or HEIC." };
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, status, provider_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError || !booking) return { ok: false, error: "Booking not found." };
  if (booking.provider_id !== userId) return { ok: false, error: "Not your booking." };
  if (booking.status !== "in_progress") {
    return { ok: false, error: "Photos can only be added while the job is in progress." };
  }

  // The cap is checked before the upload is spent, not after.
  const { count } = await supabase
    .from("booking_completion_photos")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId);
  if ((count ?? 0) >= MAX_COMPLETION_PHOTOS) {
    return { ok: false, error: `Limit reached — ${MAX_COMPLETION_PHOTOS} photos per job.` };
  }

  const ext = file.filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${bookingId}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const svc = createSupabaseServiceClient();
  const { error: uploadError } = await svc.storage
    .from("booking-photos")
    .upload(path, file.bytes, { contentType: file.contentType, upsert: false });
  if (uploadError) return { ok: false, error: "Upload failed: " + uploadError.message };

  const { data: row, error: insertError } = await supabase
    .from("booking_completion_photos")
    .insert({
      booking_id: bookingId,
      uploaded_by_user_id: userId,
      storage_path: path,
      caption: file.caption?.trim() || null,
      bytes: file.bytes.byteLength,
      content_type: file.contentType,
    })
    .select("id")
    .single();

  if (insertError) {
    // Best-effort cleanup so a failed insert does not leave an orphan
    // object in a bucket nobody can see into.
    await svc.storage.from("booking-photos").remove([path]);
    return { ok: false, error: "Failed to register photo: " + insertError.message };
  }

  return { ok: true, photoId: row.id as string };
}

export async function removeCompletionPhoto(
  supabase: SupabaseClient,
  userId: string,
  photoId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Read the row first, because the storage path is the only way to find
  // the object once the row is gone.
  const { data: photo } = await supabase
    .from("booking_completion_photos")
    .select("id, booking_id, storage_path, uploaded_by_user_id")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "Photo not found, or already removed." };
  if (photo.uploaded_by_user_id !== userId) return { ok: false, error: "Not your photo." };

  const { error } = await supabase
    .from("booking_completion_photos")
    .delete()
    .eq("id", photoId);
  if (error) return { ok: false, error: error.message };

  // The row is already gone, so a failed object delete leaves an orphan
  // rather than a broken reference. Logged, not surfaced: there is
  // nothing the helper could do about it.
  try {
    const svc = createSupabaseServiceClient();
    await svc.storage.from("booking-photos").remove([photo.storage_path as string]);
  } catch (e) {
    console.error("orphaned completion photo object", photo.storage_path, e);
  }

  return { ok: true };
}
