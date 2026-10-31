import { withBearerAuth } from "@/lib/api/bearer";
import {
  createCardSetupIntent, saveCardFromSetupIntent, removeCard, setDefaultCard,
} from "@/lib/payments";
import { stripeConfigured } from "@/lib/stripe";

/*
  Card setup for the app.

  The web does this in a Server Action from a cookie session, which a
  native client cannot call — the same reason /api/v1 exists at all. The
  WORK is not reimplemented here: `createCardSetupIntent` and
  `saveCardFromSetupIntent` are the functions the website already uses,
  so the two surfaces cannot drift on who owns which card.

  THE APP NEVER SEES A CARD NUMBER. It receives a SetupIntent client
  secret, hands that to Stripe's own SDK, and sends back only the
  SetupIntent id. Everything recorded — brand, last four, expiry — is
  read back from Stripe by the server, so a client cannot assert a card
  it does not have or attach somebody else's.
*/

export const GET = withBearerAuth(async ({ supabase }) => {
  /*
    Read as the CALLER, so `pm_self` (0002) is what proves these cards
    are theirs — not a user id this route trusted from a token it also
    decoded. Same principle as every other v1 read.
  */
  const { data, error } = await supabase
    .from("payment_methods")
    .select("id, brand, last4, exp_month, exp_year, is_default")
    .order("is_default", { ascending: false });

  if (error) {
    return Response.json({ error: "Couldn't load your cards." }, { status: 400 });
  }
  return Response.json({ cards: data ?? [], configured: stripeConfigured() });
});

export const POST = withBearerAuth(async ({ user }, request) => {
  if (!stripeConfigured()) {
    return Response.json(
      { error: "Card payments aren't available yet." },
      { status: 503 },
    );
  }

  let body: { setupIntentId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  /*
    No body: start the flow and hand back a client secret.
    With a SetupIntent id: finish it and record the card.

    One route, because they are two halves of one action and splitting
    them invites a client that does the first and forgets the second.
  */
  if (!body.setupIntentId) {
    const started = await createCardSetupIntent(user.id);
    if (!started.ok) {
      return Response.json({ error: started.message }, { status: 400 });
    }
    return Response.json({
      clientSecret: started.clientSecret,
      customerId: started.customerId,
    });
  }

  const saved = await saveCardFromSetupIntent(user.id, body.setupIntentId);
  if (!saved.ok) {
    return Response.json({ error: saved.message }, { status: 400 });
  }
  return Response.json({ card: saved.card });
});

/*
  Removing a card, and choosing which one is used by default.

  Both reuse the website's own functions, which scope every query by
  `customer_id = userId` — so a card id belonging to somebody else
  matches nothing rather than being deleted.
*/
export const DELETE = withBearerAuth(async ({ user }, request) => {
  const cardId = new URL(request.url).searchParams.get("id");
  if (!cardId) {
    return Response.json({ error: "Which card?" }, { status: 400 });
  }
  const result = await removeCard(user.id, cardId);
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 400 });
  }
  return Response.json({ removed: true });
});

export const PATCH = withBearerAuth(async ({ user }, request) => {
  let body: { cardId?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (!body.cardId) {
    return Response.json({ error: "Which card?" }, { status: 400 });
  }
  const result = await setDefaultCard(user.id, body.cardId);
  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 400 });
  }
  return Response.json({ updated: true });
});
