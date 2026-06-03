"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type State = { ok: true } | { error: string };

// Persist a OneSignal player_id for the current user. Called from the
// browser after OneSignal.User.PushSubscription.id resolves. Idempotent
// — uses upsert with onConflict on (user_id, player_id) so re-enabling
// from the same device just bumps last_seen_at instead of erroring on
// the unique index.
export async function registerPushSubscriptionAction(
  playerId: string,
  userAgent: string | null,
): Promise<State> {
  if (!playerId || typeof playerId !== "string" || playerId.length > 200) {
    return { error: "Invalid player id." };
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        player_id: playerId,
        user_agent: userAgent ? userAgent.slice(0, 200) : null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,player_id" },
    );
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

export async function unregisterPushSubscriptionAction(playerId: string): Promise<State> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in." };

  // RLS gates on user_id but the explicit eq is belt-and-braces.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("player_id", playerId);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
