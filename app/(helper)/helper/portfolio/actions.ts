"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setPortfolioPhoto } from "@/lib/portfolio";

type State = { error?: string; success?: string } | undefined;

/*
  Helper toggles is_portfolio on a completion photo, and/or rewrites the
  portfolio caption.

  THE WORK ITSELF LIVES IN lib/portfolio.ts, shared with
  /api/v1/helper/portfolio, which the native app calls. It used to live
  here alone — and then the app needed the same write, which is exactly
  how two implementations of one consent rule come about. RLS enforces
  the rest: the helper must be the uploader and the booking's provider,
  and the booking must have reached 'completed'.
*/
export async function setPortfolioPhotoAction(
  photoId: string,
  next: { isPortfolio?: boolean; caption?: string | null },
): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const result = await setPortfolioPhoto(supabase, user.id, photoId, next);
  if (!result.ok) return { error: result.error };

  revalidatePath("/helper/portfolio");
  // Public profile may be cached server-side; bust it so the change shows up.
  revalidatePath("/helpers/[id]", "page");
  return { success: result.message };
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
  revalidatePath("/helpers/[id]", "page");
  return { success: "Photo removed from your helper's public portfolio." };
}
