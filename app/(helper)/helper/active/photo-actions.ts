"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { addCompletionPhoto, removeCompletionPhoto } from "@/lib/completion-photos";

type State = { error?: string; success?: string; photoId?: string } | undefined;

/*
  The validation, the ownership checks, the per-booking cap and the
  service-role push all live in lib/completion-photos.ts, shared with
  /api/v1/helper/bookings/[id]/photos — the helper app uploads the same
  photos to the same private bucket, and a second copy of "may this
  person touch this booking" is not a thing to have two of.
*/
export async function uploadCompletionPhotoAction(
  bookingId: string,
  formData: FormData,
): Promise<State> {
  const file = formData.get("file");
  const caption = (formData.get("caption") as string | null)?.trim() || null;
  if (!(file instanceof File)) return { error: "No file attached." };

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const result = await addCompletionPhoto(supabase, user.id, bookingId, {
    bytes: new Uint8Array(await file.arrayBuffer()),
    contentType: file.type,
    filename: file.name,
    caption,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/helper/active");
  revalidatePath(`/bookings/${bookingId}`);
  return { success: "Photo added.", photoId: result.photoId };
}

export async function deleteCompletionPhotoAction(photoId: string): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  /*
    The booking id is read back out so the customer's page can be
    revalidated too — the photo is proof shown to them, not only to the
    helper who took it.
  */
  const { data: photo } = await supabase
    .from("booking_completion_photos")
    .select("booking_id")
    .eq("id", photoId)
    .maybeSingle();

  const result = await removeCompletionPhoto(supabase, user.id, photoId);
  if (!result.ok) return { error: result.error };

  revalidatePath("/helper/active");
  if (photo?.booking_id) revalidatePath(`/bookings/${photo.booking_id}`);
  return { success: "Removed." };
}
