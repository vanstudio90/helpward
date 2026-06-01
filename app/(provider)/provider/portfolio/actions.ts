"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { error } = await supabase
    .from("booking_completion_photos")
    .update(update)
    .eq("id", photoId)
    .eq("uploaded_by_user_id", user.id);
  if (error) return { error: error.message };

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
