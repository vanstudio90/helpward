-- CLASS: pre-deploy
-- =========================================================================
-- 0044 — saved cards
--
-- Adds the constraint the card-save upsert needs, and takes write access
-- away from the customer.
--
-- A row here is a claim that Stripe holds a card. Only the server can know
-- that, so only the server may write one: otherwise a customer could
-- insert a payment_methods row naming any payment method id, and
-- authorizeBookingPayment would hand it to Stripe.
-- =========================================================================

-- Re-saving the same card must update the row, not create a second one.
-- Also prevents two customers pointing at one payment method.
create unique index if not exists payment_methods_stripe_pm_uniq
  on payment_methods (stripe_payment_method_id);

create index if not exists payment_methods_default_idx
  on payment_methods (customer_id, is_default);

revoke insert, update, delete on payment_methods from authenticated;

-- Reading your own cards stays allowed: the page lists them, and the row
-- holds only brand, last four and expiry — never a card number.
alter table payment_methods enable row level security;
drop policy if exists pm_read_own on payment_methods;
create policy pm_read_own on payment_methods
  for select using (customer_id = auth.uid() or is_admin());
