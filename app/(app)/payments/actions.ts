"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createCardSetupIntent,
  saveCardFromSetupIntent,
  removeCard,
  setDefaultCard,
} from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Start card entry. Returns the client secret Elements needs. */
export async function beginCardSetupAction() {
  if (!stripeConfigured()) return { error: "Card payments are not available yet." };
  const user = await requireUser();
  if (!user) return { error: "Not logged in." };

  const intent = await createCardSetupIntent(user.id);
  if (!intent.ok) return { error: intent.message };
  return { clientSecret: intent.clientSecret };
}

/**
 * Record the card after Elements confirms it.
 *
 * The browser sends a SetupIntent id and nothing else. The server reads
 * the card back from Stripe and checks the intent belongs to this
 * customer, so a posted id for someone else's intent is rejected rather
 * than attaching their card to this account.
 */
export async function saveCardAction(setupIntentId: string) {
  const user = await requireUser();
  if (!user) return { error: "Not logged in." };

  const saved = await saveCardFromSetupIntent(user.id, setupIntentId);
  if (!saved.ok) return { error: saved.message };

  revalidatePath("/payments");
  revalidatePath("/new-request");
  return { success: `${saved.card.brand ?? "Card"} ending ${saved.card.last4} saved.` };
}

export async function removeCardAction(cardId: string) {
  const user = await requireUser();
  if (!user) return { error: "Not logged in." };

  const removed = await removeCard(user.id, cardId);
  if (!removed.ok) return { error: removed.message };

  revalidatePath("/payments");
  return { success: "Card removed." };
}

export async function setDefaultCardAction(cardId: string) {
  const user = await requireUser();
  if (!user) return { error: "Not logged in." };

  const done = await setDefaultCard(user.id, cardId);
  if (!done.ok) return { error: done.message };

  revalidatePath("/payments");
  return { success: "Default card updated." };
}
