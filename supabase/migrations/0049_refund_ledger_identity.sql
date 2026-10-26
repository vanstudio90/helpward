-- CLASS: pre-deploy
-- =========================================================================
-- 0049 — one ledger row per Stripe refund
--
-- A $10 refund was issued successfully at Stripe and never recorded here:
-- refunds.status is NOT NULL and the insert omitted it, so the write
-- failed while the refund itself had already gone through. The customer's
-- spending total went on showing money that was back on their card.
--
-- Two consequences, both fixed here. The insert now sets status (in
-- lib/payments.ts), and the ledger gains an identity so reconciliation can
-- be re-run safely: scripts/reconcile-refunds.mjs upserts by Stripe refund
-- id, which means repairing a missing row can never issue another refund.
-- =========================================================================

-- Duplicate rows would double-count a refund in the customer's totals.
--
-- NOT partial. A partial unique index cannot back an ON CONFLICT clause
-- unless the statement repeats its predicate, and PostgREST's upsert only
-- takes column names — so the first version of this index existed, looked
-- right, and made every reconciliation upsert fail with "no unique or
-- exclusion constraint matching the ON CONFLICT specification".
--
-- A plain unique index is correct here regardless: Postgres treats NULLs
-- as distinct, so rows with no Stripe id (manual adjustments) are still
-- allowed to coexist.
drop index if exists refunds_stripe_id_uniq;
create unique index if not exists refunds_stripe_id_uniq
  on refunds (stripe_refund_id);

create index if not exists refunds_booking_idx on refunds (booking_id);

-- The customer sees their own refunds; it is their money.
alter table refunds enable row level security;
drop policy if exists refunds_read_own on refunds;
create policy refunds_read_own on refunds
  for select using (
    is_admin()
    or exists (
      select 1 from bookings b
       where b.id = refunds.booking_id
         and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
  );
