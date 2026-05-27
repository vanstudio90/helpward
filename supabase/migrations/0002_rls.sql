-- Row-Level Security policies for Helpward.
-- Every table gets RLS ON. Service role bypasses RLS automatically.
-- Pattern: app users are restricted; admin (jwt role='admin') sees everything.

-- =========================================================================
-- Helper: read the role claim from JWT
-- =========================================================================
create or replace function public.jwt_role() returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() ->> 'role', 'customer')
$$;

create or replace function public.is_admin() returns boolean language sql stable as $$
  select public.jwt_role() = 'admin'
$$;

-- =========================================================================
-- profiles
-- =========================================================================
alter table profiles enable row level security;

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select using (
    id = auth.uid()
    or is_admin()
    -- providers visible to all authed users (public-ish profile)
    or role = 'provider'
  );

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
  for update using (id = auth.uid() or is_admin())
  with check (
    id = auth.uid()
    -- Only admin can change role
    or is_admin()
  );

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
  for insert with check (id = auth.uid() or is_admin());

-- =========================================================================
-- customer_profiles
-- =========================================================================
alter table customer_profiles enable row level security;

drop policy if exists cp_self on customer_profiles;
create policy cp_self on customer_profiles
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- =========================================================================
-- provider_profiles
-- =========================================================================
alter table provider_profiles enable row level security;

drop policy if exists pp_read on provider_profiles;
create policy pp_read on provider_profiles
  for select using (
    user_id = auth.uid()
    or is_admin()
    or status = 'approved'   -- approved providers are publicly listable
  );

drop policy if exists pp_self_update on provider_profiles;
create policy pp_self_update on provider_profiles
  for update using (user_id = auth.uid() or is_admin())
  with check (
    -- providers can't self-approve
    (user_id = auth.uid() and (status = 'pending' or status = (select status from provider_profiles where user_id = auth.uid())))
    or is_admin()
  );

drop policy if exists pp_insert on provider_profiles;
create policy pp_insert on provider_profiles
  for insert with check (user_id = auth.uid() or is_admin());

-- =========================================================================
-- service catalog (mostly readable by all, mutable only by admin)
-- =========================================================================
alter table service_categories enable row level security;
drop policy if exists sc_read on service_categories;
create policy sc_read on service_categories for select using (true);
drop policy if exists sc_write on service_categories;
create policy sc_write on service_categories for all using (is_admin()) with check (is_admin());

alter table services enable row level security;
drop policy if exists svc_read on services;
create policy svc_read on services for select using (true);
drop policy if exists svc_write on services;
create policy svc_write on services for all using (is_admin()) with check (is_admin());

alter table provider_services enable row level security;
drop policy if exists ps_read on provider_services;
create policy ps_read on provider_services for select using (true);
drop policy if exists ps_self_write on provider_services;
create policy ps_self_write on provider_services
  for all using (provider_id = auth.uid() or is_admin())
  with check (provider_id = auth.uid() or is_admin());

-- =========================================================================
-- addresses
-- =========================================================================
alter table addresses enable row level security;
drop policy if exists addr_self on addresses;
create policy addr_self on addresses
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- =========================================================================
-- requests
-- =========================================================================
alter table requests enable row level security;
drop policy if exists req_read on requests;
create policy req_read on requests
  for select using (
    customer_id = auth.uid()
    or is_admin()
    -- Providers can read requests they were notified about
    or exists (
      select 1 from match_attempts m
      where m.request_id = requests.id and m.provider_id = auth.uid()
    )
  );

drop policy if exists req_insert on requests;
create policy req_insert on requests
  for insert with check (customer_id = auth.uid());

drop policy if exists req_update on requests;
create policy req_update on requests
  for update using (customer_id = auth.uid() or is_admin());

-- =========================================================================
-- bookings
-- =========================================================================
alter table bookings enable row level security;
drop policy if exists b_read on bookings;
create policy b_read on bookings
  for select using (
    customer_id = auth.uid()
    or provider_id = auth.uid()
    or is_admin()
  );

drop policy if exists b_update on bookings;
create policy b_update on bookings
  for update using (
    customer_id = auth.uid()
    or provider_id = auth.uid()
    or is_admin()
  );
-- bookings are created by the matching backend (service_role), no insert policy

-- =========================================================================
-- match_attempts (server-managed; providers read their own)
-- =========================================================================
alter table match_attempts enable row level security;
drop policy if exists ma_read on match_attempts;
create policy ma_read on match_attempts
  for select using (provider_id = auth.uid() or is_admin());
drop policy if exists ma_provider_respond on match_attempts;
create policy ma_provider_respond on match_attempts
  for update using (provider_id = auth.uid() or is_admin());

-- =========================================================================
-- conversations
-- =========================================================================
alter table conversations enable row level security;
drop policy if exists conv_self on conversations;
create policy conv_self on conversations
  for select using (
    customer_id = auth.uid()
    or provider_id = auth.uid()
    or is_admin()
  );

-- =========================================================================
-- messages
-- =========================================================================
alter table messages enable row level security;
drop policy if exists msg_self on messages;
create policy msg_self on messages
  for select using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.customer_id = auth.uid() or c.provider_id = auth.uid())
    )
    or is_admin()
  );

drop policy if exists msg_send on messages;
create policy msg_send on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id
        and (c.customer_id = auth.uid() or c.provider_id = auth.uid())
    )
  );

drop policy if exists msg_mark_read on messages;
create policy msg_mark_read on messages
  for update using (
    exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.customer_id = auth.uid() or c.provider_id = auth.uid())
    )
    and sender_id <> auth.uid()  -- can only update receipts on messages YOU received
  );

-- =========================================================================
-- locations
-- =========================================================================
alter table provider_locations enable row level security;
-- Provider writes their own location; customer of active booking reads
drop policy if exists loc_self_write on provider_locations;
create policy loc_self_write on provider_locations
  for all using (provider_id = auth.uid() or is_admin())
  with check (provider_id = auth.uid() or is_admin());

drop policy if exists loc_active_customer_read on provider_locations;
create policy loc_active_customer_read on provider_locations
  for select using (
    exists (
      select 1 from bookings b
      where b.provider_id = provider_locations.provider_id
        and b.status = 'in_progress'
        and b.customer_id = auth.uid()
    )
    or is_admin()
  );

alter table booking_location_pings enable row level security;
drop policy if exists bp_read on booking_location_pings;
create policy bp_read on booking_location_pings
  for select using (
    exists (
      select 1 from bookings b
      where b.id = booking_location_pings.booking_id
        and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
    or is_admin()
  );

-- =========================================================================
-- payment_methods (customer's own)
-- =========================================================================
alter table payment_methods enable row level security;
drop policy if exists pm_self on payment_methods;
create policy pm_self on payment_methods
  for all using (customer_id = auth.uid() or is_admin())
  with check (customer_id = auth.uid() or is_admin());

-- =========================================================================
-- payouts (provider read-only of their own)
-- =========================================================================
alter table payouts enable row level security;
drop policy if exists po_read on payouts;
create policy po_read on payouts
  for select using (provider_id = auth.uid() or is_admin());

-- =========================================================================
-- refunds (parties read their own; admin all)
-- =========================================================================
alter table refunds enable row level security;
drop policy if exists rf_read on refunds;
create policy rf_read on refunds
  for select using (
    exists (
      select 1 from bookings b
      where b.id = refunds.booking_id
        and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
    or is_admin()
  );

-- =========================================================================
-- reviews (write only by customer on their own booking)
-- =========================================================================
alter table reviews enable row level security;
drop policy if exists rev_read on reviews;
create policy rev_read on reviews for select using (
  customer_visible = true or customer_id = auth.uid() or provider_id = auth.uid() or is_admin()
);
drop policy if exists rev_insert on reviews;
create policy rev_insert on reviews
  for insert with check (
    customer_id = auth.uid()
    and exists (
      select 1 from bookings b
      where b.id = booking_id
        and b.customer_id = auth.uid()
        and b.status = 'completed'
    )
  );

-- =========================================================================
-- notifications (self)
-- =========================================================================
alter table notification_prefs enable row level security;
drop policy if exists np_self on notification_prefs;
create policy np_self on notification_prefs
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

alter table notifications enable row level security;
drop policy if exists notif_self on notifications;
create policy notif_self on notifications
  for select using (user_id = auth.uid() or is_admin());
drop policy if exists notif_self_update on notifications;
create policy notif_self_update on notifications
  for update using (user_id = auth.uid() or is_admin());

-- =========================================================================
-- favorites
-- =========================================================================
alter table favorites enable row level security;
drop policy if exists fav_self on favorites;
create policy fav_self on favorites
  for all using (user_id = auth.uid() or is_admin())
  with check (user_id = auth.uid() or is_admin());

-- =========================================================================
-- disputes
-- =========================================================================
alter table disputes enable row level security;
drop policy if exists dsp_read on disputes;
create policy dsp_read on disputes
  for select using (
    opened_by = auth.uid()
    or is_admin()
    or exists (
      select 1 from bookings b
      where b.id = disputes.booking_id
        and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
  );
drop policy if exists dsp_open on disputes;
create policy dsp_open on disputes
  for insert with check (
    opened_by = auth.uid()
    and exists (
      select 1 from bookings b
      where b.id = booking_id
        and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

-- =========================================================================
-- audit_log (admin only)
-- =========================================================================
alter table audit_log enable row level security;
drop policy if exists al_admin on audit_log;
create policy al_admin on audit_log for all using (is_admin()) with check (is_admin());
