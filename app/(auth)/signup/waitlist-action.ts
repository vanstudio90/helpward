"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/* Record a helper in a city Helpward does not serve yet.
 *
 * Writes through join_helper_waitlist (migration 0071), which is the only
 * door into that table — it is otherwise unreadable and unwritable from the
 * browser. The function returns nothing on success, so a caller can never
 * use this to discover whether an address is already on the list.
 */
export async function joinWaitlistAction(
  email: string, city: string, country: string,
): Promise<{ error?: string } | undefined> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("join_helper_waitlist", {
    p_email: email, p_city: city, p_region: null, p_country: country,
  });
  if (error) return { error: "Couldn't save that — try again in a moment." };
  return undefined;
}
