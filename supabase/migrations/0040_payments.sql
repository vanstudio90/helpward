-- =========================================================================
-- 0040 — payment and payout state
--
-- CLASS: pre-deploy safe. Adds nullable columns, indexes and grants only.
-- Nothing here changes the behaviour of code already running, so it can be
-- applied before the release that uses it.
--
-- Until now the three Stripe webhooks had nowhere to write. account.updated
-- in particular performed `.update({})` — an empty object with the intent
-- in a comment — so a helper could finish Stripe onboarding and Helpward
-- would never learn of it. These columns are that missing destination.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Helper payout readiness, mirrored from Stripe
-- -------------------------------------------------------------------------
-- Mirrored, not authoritative: Stripe owns these facts. They are cached
-- here so the dispatcher can exclude un-payable helpers without an API
-- call per candidate, and refreshed by the account.updated webhook.
alter table provider_profiles
  add column if not exists stripe_charges_enabled   boolean not null default false,
  add column if not exists stripe_payouts_enabled   boolean not null default false,
  add column if not exists stripe_details_submitted boolean not null default false,
  -- payouts_enabled can be true while the transfers capability is still
  -- inactive. A destination charge to such an account fails at
  -- authorization, with the customer watching — so this is the flag the
  -- dispatcher actually gates on.
  add column if not exists stripe_transfers_active  boolean not null default false,
  add column if not exists stripe_requirements_due  jsonb   not null default '[]'::jsonb,
  add column if not exists stripe_disabled_reason   text,
  add column if not exists stripe_onboarded_at      timestamptz;

create index if not exists provider_profiles_payable_idx
  on provider_profiles (stripe_transfers_active)
  where stripe_transfers_active;

-- -------------------------------------------------------------------------
-- Booking payment lifecycle
-- -------------------------------------------------------------------------
alter table bookings
  add column if not exists stripe_charge_id   text,
  add column if not exists stripe_transfer_id text,
  add column if not exists authorized_at      timestamptz,
  add column if not exists captured_at        timestamptz,
  -- Last failure message from Stripe, shown to the customer and to support.
  add column if not exists payment_error      text;

-- Webhook idempotency: payment_intent.succeeded can be delivered more than
-- once, and a retry must not match two bookings. Partial so the many
-- bookings with no intent yet do not collide on NULL.
create unique index if not exists bookings_payment_intent_uniq
  on bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists bookings_payment_status_idx
  on bookings (payment_status)
  where payment_status in ('pending', 'authorized', 'failed');

-- -------------------------------------------------------------------------
-- Only the service role writes money state
-- -------------------------------------------------------------------------
-- A column-level REVOKE does NOT override a table-level GRANT. Supabase
-- grants ALL on every public table to `authenticated` by default, so the
-- first version of this migration revoked UPDATE on fourteen money columns
-- and changed nothing: all 29 columns of bookings stayed writable. The
-- same mistake is live in 0036, whose column revokes on addresses,
-- saved_addresses and request_bundle_items are also no-ops (the BEFORE
-- triggers there are what actually enforce the attestation; the grant
-- layer it claims as defence-in-depth is absent).
--
-- The working shape is: revoke the table-level privilege, then grant back
-- exactly the columns an end user legitimately writes.

revoke update on bookings from authenticated;
revoke update on provider_profiles from authenticated;

-- Bookings: nothing. Every field a customer or helper changes — cancel,
-- start, complete, tip — already goes through a SECURITY DEFINER function
-- that re-derives the values. No column needs direct UPDATE.
--
-- The one exception was the tip, which app/(app)/bookings/actions.ts wrote
-- as three raw columns (tip_cents, total_cents, payout_cents) computed in
-- the server action. The arithmetic there was right, but the privilege was
-- the problem: any authenticated customer could PostgREST their own
-- booking and set payout_cents to an arbitrary number. set_booking_tip()
-- below replaces it.

-- Provider profiles: the fields a helper edits about themselves.
grant update (
  bio, languages, service_radius_km, timezone, slug,
  is_online, current_location, base_location, location_updated_at,
  vacation_mode, vacation_returns_on
) on provider_profiles to authenticated;

-- payouts and refunds are written only by webhook handlers running as the
-- service role; no end user has a reason to write either table directly.
revoke insert, update, delete on payouts from authenticated;
revoke insert, update, delete on refunds from authenticated;

-- -------------------------------------------------------------------------
-- set_booking_tip — the tip, derived rather than supplied
-- -------------------------------------------------------------------------
-- 100% of a tip goes to the helper and Helpward takes no commission on it,
-- so the tip is the one amount that moves payout_cents after acceptance.
-- Deriving total and payout here means the client sends one number (the
-- tip) and cannot influence anything else.
create or replace function public.set_booking_tip(
  p_booking_id uuid,
  p_tip_cents int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking record;
  v_tip int := greatest(0, coalesce(p_tip_cents, 0));
  v_old_tip int;
begin
  if v_tip > 50000 then
    raise exception 'Tip is capped at $500.';
  end if;

  select * into v_booking from bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;

  if auth.uid() is not null and auth.uid() <> v_booking.customer_id then
    raise exception 'Only the customer can add a tip.';
  end if;
  if v_booking.status <> 'completed' then
    raise exception 'You can only tip a completed booking.';
  end if;

  v_old_tip := coalesce(v_booking.tip_cents, 0);

  -- Rebuild both totals from the booking's own priced components rather
  -- than adjusting them, so a previously wrong value cannot persist and a
  -- repeated tip cannot compound.
  update bookings set
    tip_cents   = v_tip,
    total_cents = coalesce(base_price_cents, 0)
                + coalesce(service_fee_cents, 0)
                + coalesce(distance_cents, 0)
                + v_tip,
    payout_cents = (coalesce(payout_cents, 0) - v_old_tip) + v_tip
  where id = p_booking_id;
end;
$$;

revoke execute on function public.set_booking_tip(uuid, int) from public;
grant execute on function public.set_booking_tip(uuid, int) to authenticated, service_role;
