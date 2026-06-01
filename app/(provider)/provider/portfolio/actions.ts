"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

type State = { error?: string; success?: string } | undefined;

const MAX_CAPTION = 200;

// Helper toggles is_portfolio on a completion photo. RLS enforces the rest:
//   * Helper must be the uploader AND the booking's provider
//   * Booking must be in 'completed' status (no half-finished tasks in the
//     public gallery)
//
// We accept an optional caption update in the same call so the helper can
// rewrite the customer-facing "left at side door" into portfolio-friendly
// copy in one move. Caption is independent of is_portfolio so the helper
// can polish it before flipping the flag.
export async function setPortfolioPhotoAction(
  photoId: string,
  next: { isPortfolio?: boolean; caption?: string | null },
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const update: Record<string, unknown> = {};
  if (typeof next.isPortfolio === "boolean") update.is_portfolio = next.isPortfolio;
  if (next.caption !== undefined) {
    const cleaned = next.caption == null ? null : next.caption.trim().slice(0, MAX_CAPTION);
    update.portfolio_caption = cleaned && cleaned.length > 0 ? cleaned : null;
  }
  if (Object.keys(update).length === 0) return { error: "Nothing to update." };

  // Read prior state so we can detect a false→true transition. We need this
  // for the customer-notification side-effect — toggling OFF or editing a
  // caption shouldn't bother the customer; only the moment a photo of
  // theirs becomes publicly featured should.
  const { data: prior } = await supabase
    .from("booking_completion_photos")
    .select("is_portfolio, booking_id")
    .eq("id", photoId)
    .eq("uploaded_by_user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("booking_completion_photos")
    .update(update)
    .eq("id", photoId)
    .eq("uploaded_by_user_id", user.id);
  if (error) return { error: error.message };

  // Notify the customer when their photo just became public. Service role
  // for the insert because notifications has no broad-insert RLS — same
  // pattern as the matching engine + cron handlers. Best-effort: a failed
  // notification doesn't roll back the toggle.
  if (
    prior
    && prior.is_portfolio === false
    && next.isPortfolio === true
    && prior.booking_id
  ) {
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
            helper_id: user.id,
          },
        });
      }
    } catch (e) {
      console.error("portfolio_photo_featured notify failed:", e);
    }
  }

  revalidatePath("/provider/portfolio");
  // Public profile may be cached server-side; bust it so the change shows up.
  revalidatePath("/providers/[id]", "page");
  return { success: typeof next.isPortfolio === "boolean"
    ? (next.isPortfolio ? "Added to portfolio." : "Removed from portfolio.")
    : "Caption updated." };
}

// Customer revokes a photo from a helper's portfolio. RLS check enforces
// they were the booking's customer; the WITH CHECK in 0020 forces
// is_portfolio=false so they can't re-flag, only remove.
export async function revokePortfolioConsentAction(
  photoId: string,
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase
    .from("booking_completion_photos")
    .update({ is_portfolio: false })
    .eq("id", photoId);
  if (error) return { error: error.message };

  revalidatePath("/bookings");
  revalidatePath("/providers/[id]", "page");
  return { success: "Photo removed from your helper's public portfolio." };
}
