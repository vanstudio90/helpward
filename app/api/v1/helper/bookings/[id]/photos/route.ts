import { withBearerAuth } from "@/lib/api/bearer";
import { addCompletionPhoto, removeCompletionPhoto } from "@/lib/completion-photos";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { COMPLETION_PHOTO_MAX_BYTES } from "@/lib/completion-photo-pure";

/*
  Proof-of-completion photos, from the helper app.

  Here rather than straight to Supabase Storage because the
  booking-photos bucket is PRIVATE: the bytes are pushed with the
  service-role client, which is not something a phone can hold. The
  ownership checks still run as the caller, so the service key moves
  bytes and decides nothing.

  Multipart in, because that is what an image is. The same shared
  implementation backs the website's server action.
*/

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;

  /*
    Authenticate BEFORE touching the body. Parsing first meant an
    anonymous caller could make the function decode a multipart upload
    and only then be told to sign in — free work for anyone who asked,
    and a 400 where a 401 belongs.
  */
  return withBearerAuth(async ({ user, supabase }) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json(
        { error: "Expected a multipart form with a `file` part." },
        { status: 400 },
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No photo attached." }, { status: 400 });
    }
    /*
      Refused before the bytes are copied into a Uint8Array, and with
      413 rather than the shared implementation's 409, so an app that is
      retrying can tell "too big" apart from "wrong state".

      This is NOT a guard against a huge upload: formData() has already
      read the body by the time we get here. Bounding what actually
      reaches the function is the platform's job, not this handler's.
    */
    if (file.size > COMPLETION_PHOTO_MAX_BYTES) {
      return Response.json({ error: "Photo too large — max 8 MB." }, { status: 413 });
    }

    const caption = form.get("caption");

    const result = await addCompletionPhoto(supabase, user.id, id, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      filename: file.name,
      caption: typeof caption === "string" ? caption : null,
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({ photoId: result.photoId });
  })(request);
}

/*
  The photos already on this booking, each with a URL that can actually
  be loaded.

  The bucket is private, so a storage path is not something an image
  view can fetch. Signing happens here, with the service client, for one
  hour — the same thing the website's pages do. The rows themselves are
  read as the CALLER, so RLS decides whose photos these are and the
  service key only turns paths into links.
*/
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return withBearerAuth(async ({ supabase }) => {
    const { data: rows, error } = await supabase
      .from("booking_completion_photos")
      .select("id, storage_path, caption, created_at")
      .eq("booking_id", id)
      .order("created_at");
    if (error) return Response.json({ error: error.message }, { status: 409 });

    const list = rows ?? [];
    if (list.length === 0) return Response.json({ photos: [] });

    const svc = createSupabaseServiceClient();
    const { data: signed } = await svc.storage
      .from("booking-photos")
      .createSignedUrls(list.map((r) => r.storage_path as string), 3600);

    return Response.json({
      photos: list.map((row, i) => ({
        id: row.id,
        caption: row.caption,
        createdAt: row.created_at,
        // Null rather than a broken link when signing fails, so the app
        // can show a placeholder instead of an image that never loads.
        url: signed?.[i]?.signedUrl ?? null,
      })),
    });
  })(request);
}

/** `?photoId=…`, since the path id is the booking. */
export async function DELETE(request: Request) {
  const photoId = new URL(request.url).searchParams.get("photoId");
  if (!photoId) {
    return Response.json({ error: "Which photo?" }, { status: 400 });
  }
  return withBearerAuth(async ({ user, supabase }) => {
    const result = await removeCompletionPhoto(supabase, user.id, photoId);
    if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
    return Response.json({ removed: true });
  })(request);
}
