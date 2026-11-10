import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

/*
  THE HELPER'S PORTFOLIO: WHICH COMPLETION PHOTOS GO ON THEIR PROFILE.

  Shared by the website's server action and /api/v1/helper/portfolio, for
  the same reason completion photos are: the booking-photos bucket is
  PRIVATE and has no read policy at all — 0007 says "reads are
  server-side only via service-role signed URLs" — so a storage path is
  not something a phone or a browser can fetch. Signing happens here.

  THE OWNERSHIP CHECKS RUN AS THE CALLER. `bcp_helper_update_portfolio`
  (0020) already allows the uploader to flag only their own photo, and
  only on a booking they provided that has reached 'completed'. The
  service client turns paths into links and inserts the customer's
  notification; it decides nothing.

  WHY THE TOGGLE IS NOT A DIRECT POSTGREST WRITE FROM THE APP. It could
  be — the policy permits it. But flipping a photo to public also
  notifies the customer whose home is in it, and `notifications` has no
  broad insert policy, so a client-side toggle would silently drop the
  one message that makes the consent model work. The notification is part
  of the write, so the write goes through a server.
*/

const MAX_CAPTION = 200;
/** An hour, same as every other signed URL in the estate. */
const SIGNED_URL_TTL = 60 * 60;

export type PortfolioPhoto = {
  id: string;
  signedUrl: string;
  caption: string | null;
  portfolioCaption: string | null;
  isPortfolio: boolean;
  bookingId: string;
  serviceTitle: string;
  completedAt: string;
};

type Row = {
  id: string;
  storage_path: string;
  caption: string | null;
  portfolio_caption: string | null;
  is_portfolio: boolean;
  booking_id: string;
  booking: {
    completed_at: string | null;
    status: string;
    service: { title: string } | null;
  } | null;
};

/**
 * Every completion photo this helper has uploaded on a completed
 * booking, newest first, each with a URL that can actually be loaded.
 *
 * A photo whose URL could not be signed is dropped rather than returned
 * with an empty string: a tile that can never render is worse than one
 * fewer tile.
 */
export async function listPortfolioPhotos(
  supabase: SupabaseClient,
  userId: string,
): Promise<PortfolioPhoto[]> {
  const { data: rows } = await supabase
    .from("booking_completion_photos")
    .select(`
      id, storage_path, caption, portfolio_caption, is_portfolio, booking_id,
      booking:bookings!booking_completion_photos_booking_id_fkey(
        completed_at, status,
        service:services(title)
      )
    `)
    .eq("uploaded_by_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  /*
    Filtered here rather than in the query because the status lives on
    the EMBED. `.eq("booking.status", …)` is not a filter PostgREST
    applies to the parent row — it would return the photo with a null
    booking — and an unfinished job must not reach a screen whose whole
    purpose is choosing what to publish.
  */
  const list = ((rows as Row[] | null) ?? []).filter(
    (r) => r.booking?.status === "completed",
  );
  if (list.length === 0) return [];

  const svc = createSupabaseServiceClient();
  const { data: signed } = await svc.storage
    .from("booking-photos")
    .createSignedUrls(list.map((r) => r.storage_path), SIGNED_URL_TTL);
  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path ?? "", s.signedUrl ?? ""] as const),
  );

  return list
    .map((r) => ({
      id: r.id,
      signedUrl: urlByPath.get(r.storage_path) ?? "",
      caption: r.caption,
      portfolioCaption: r.portfolio_caption,
      isPortfolio: r.is_portfolio,
      bookingId: r.booking_id,
      serviceTitle: r.booking?.service?.title ?? "Task",
      completedAt: r.booking?.completed_at ?? "",
    }))
    .filter((p) => p.signedUrl);
}

export type PortfolioUpdate = {
  isPortfolio?: boolean;
  /** Null or empty clears it. */
  caption?: string | null;
};

export type PortfolioResult =
  | { ok: true; message: string; isPortfolio?: boolean }
  | { ok: false; error: string };

/**
 * Flag a photo for the public profile, rewrite its caption, or both.
 *
 * Captions are independent of the flag on purpose, so a helper can
 * polish the customer-facing "left at side door" into something they
 * would publish before making it public.
 */
export async function setPortfolioPhoto(
  supabase: SupabaseClient,
  userId: string,
  photoId: string,
  next: PortfolioUpdate,
): Promise<PortfolioResult> {
  const update: Record<string, unknown> = {};
  if (typeof next.isPortfolio === "boolean") update.is_portfolio = next.isPortfolio;
  if (next.caption !== undefined) {
    const cleaned = next.caption == null ? null : next.caption.trim().slice(0, MAX_CAPTION);
    update.portfolio_caption = cleaned && cleaned.length > 0 ? cleaned : null;
  }
  if (Object.keys(update).length === 0) return { ok: false, error: "Nothing to update." };

  /*
    The prior state, read before the write, so a false → true transition
    can be told apart from a caption edit. Toggling OFF or rewording
    should not notify anybody; only the moment a photo of somebody's home
    becomes public should.
  */
  const { data: prior } = await supabase
    .from("booking_completion_photos")
    .select("is_portfolio, booking_id")
    .eq("id", photoId)
    .eq("uploaded_by_user_id", userId)
    .maybeSingle();

  /*
    THE UPDATED ROW COMES BACK, OR NOTHING HAPPENED.

    PostgREST answers an UPDATE that matched no rows with success and an
    empty set — so this reported "Caption updated." to a CUSTOMER
    editing a helper's photo, on a write that changed nothing. No edit
    took place (the filters and `bcp_helper_update_portfolio` both
    refuse it, and a database read confirmed the caption stayed null),
    but a screen told somebody their change had saved when it had not,
    which is the kind of answer that gets trusted once and acted on
    twice.

    `.select()` makes the server return what it wrote; an empty array is
    now a refusal, reported as one.
  */
  const { data: changed, error } = await supabase
    .from("booking_completion_photos")
    .update(update)
    .eq("id", photoId)
    .eq("uploaded_by_user_id", userId)
    .select("id, is_portfolio, portfolio_caption");
  if (error) return { ok: false, error: error.message };
  if (!changed || changed.length === 0) {
    return {
      ok: false,
      error: "That photo can't be changed — it isn't yours, or its booking hasn't finished.",
    };
  }

  if (prior && prior.is_portfolio === false && next.isPortfolio === true && prior.booking_id) {
    // Best effort: a failed notification does not undo the toggle, and
    // the helper is not told about a message that was never theirs.
    try {
      const admin = createSupabaseServiceClient();
      const { data: booking } = await admin
        .from("bookings")
        .select("customer_id")
        .eq("id", prior.booking_id)
        .maybeSingle();
      if (booking?.customer_id) {
        await admin.from("notifications").insert({
          user_id: booking.customer_id,
          type: "portfolio_photo_featured",
          payload: {
            booking_id: prior.booking_id,
            photo_id: photoId,
            helper_id: userId,
          },
        });
      }
    } catch (e) {
      console.error("portfolio_photo_featured notify failed:", e);
    }
  }

  return {
    ok: true,
    // What the row says now, not what was asked for.
    isPortfolio: (changed[0] as { is_portfolio?: boolean }).is_portfolio,
    message:
      typeof next.isPortfolio === "boolean"
        ? next.isPortfolio
          ? "Added to portfolio."
          : "Removed from portfolio."
        : "Caption updated.",
  };
}
