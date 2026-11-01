-- CLASS: pre-deploy
-- =========================================================================
-- 0090 — re-assert 0044's saved-card guarantees
--
-- WHY THIS EXISTS, because "0044 already did this" is what the ledger
-- says and the database disagrees.
--
-- Production carries a schema_migrations row for 0044_payment_methods.sql
-- dated 2026-10-28, with a matching checksum, yet NONE of that file's
-- effects are present:
--
--   * payment_methods_stripe_pm_uniq        absent
--   * payment_methods_default_idx           absent
--   * policy pm_read_own                    absent (pm_self, from 0002,
--                                           is still the only policy)
--   * insert/update/delete on payment_methods
--     still granted to `authenticated`      NOT revoked
--
-- A ledger row was recorded for work that never ran. The same thing
-- happened to 0051 (profiles.phone survived a migration that claimed to
-- drop it) and the cause is known: an earlier ledger backfill marked
-- files applied, and the probe used to verify it looked for objects that
-- SHOULD exist — so it was structurally blind to a migration whose job
-- was to revoke, drop or replace.
--
-- Two real consequences, both observed rather than theorised:
--
-- 1. Nobody could save a card. saveCardFromSetupIntent upserts with
--    onConflict: stripe_payment_method_id, and with no unique index
--    Postgres raises 42P10 — "there is no unique or exclusion constraint
--    matching the ON CONFLICT specification". Confirmed live against
--    POST /api/v1/payment-methods, which returned HTTP 400 with that
--    message and saved nothing. No card meant no hold, so every booking
--    sat at payment_status = pending.
--
-- 2. The write grant 0044 removed was still in place. pm_self is FOR ALL
--    with with_check (customer_id = auth.uid()), so a signed-in customer
--    could insert a payment_methods row naming any Stripe payment method
--    id, or edit the brand and last four shown in the UI, or flip
--    is_default. Stripe's own rule that a payment method must be attached
--    to the charging customer is the only thing left standing between
--    that and authorizeBookingPayment handing it over.
--
-- Everything below is idempotent, so running it where 0044 did take
-- effect changes nothing.
-- =========================================================================

-- Re-saving the same card must update the row, not create a second one,
-- and two customers must not point at one payment method. This is also
-- the constraint the upsert names.
create unique index if not exists payment_methods_stripe_pm_uniq
  on payment_methods (stripe_payment_method_id);

create index if not exists payment_methods_default_idx
  on payment_methods (customer_id, is_default);

-- A row here is a claim that Stripe holds a card. Only the server can
-- know that, so only the server may write one.
revoke insert, update, delete on payment_methods from authenticated;

-- Reading your own cards stays allowed: the row holds only brand, last
-- four and expiry, never a card number. Replacing the FOR ALL policy
-- with a read-only one is the half of 0044 that matters most — without
-- it the revoke above is the only thing stopping a write.
alter table payment_methods enable row level security;
drop policy if exists pm_self on payment_methods;
drop policy if exists pm_read_own on payment_methods;
create policy pm_read_own on payment_methods
  for select using (customer_id = auth.uid() or is_admin());

-- Prove it, rather than trusting that the statements above ran. This is
-- the lesson from 0044: a migration that claims to revoke something
-- should fail loudly if the revoke did not stick.
do $$
begin
  if not exists (
    select 1 from pg_indexes
    where tablename = 'payment_methods'
      and indexname = 'payment_methods_stripe_pm_uniq'
  ) then
    raise exception '0090: the unique index on stripe_payment_method_id is still missing';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_name = 'payment_methods'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception '0090: authenticated still holds write access to payment_methods';
  end if;

  if exists (
    select 1 from pg_policies
    where tablename = 'payment_methods' and policyname = 'pm_self'
  ) then
    raise exception '0090: the FOR ALL policy pm_self is still present';
  end if;
end $$;
