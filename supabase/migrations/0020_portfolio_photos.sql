-- Helper portfolio gallery — opt-in flag on existing completion photos so
-- helpers can feature past work on their public /providers/[id] profile.
-- We reuse the booking_completion_photos table (no new bucket, no new
-- storage paths) — just gate which rows surface beyond the customer-helper
-- pair via a boolean flag the helper sets after the booking completes.
--
-- Consent model:
--   * Helper sets is_portfolio = true on their own photos AFTER the booking
--     hits 'completed'. They can also write a portfolio_caption that's
--     different from the customer-facing caption ("left at side door" is
--     useful proof copy; "front-yard mulch refresh, 2 hrs" is portfolio copy).
--   * Customer of the booking can REVOKE — set is_portfolio = false — at
--     any time from /bookings/[id]. They can't re-flag; only the helper can
--     opt in initially. Asymmetric on purpose: helper proposes, customer
--     vetoes.
--   * Public reads only fire when is_portfolio = true AND the helper's
--     provider_profiles.status = 'approved'. A delisted helper's portfolio
--     instantly hides without us having to scrub rows.

alter table booking_completion_photos
  add column if not exists is_portfolio boolean not null default false,
  add column if not exists portfolio_caption text;

create index if not exists bcp_portfolio_idx
  on booking_completion_photos(uploaded_by_user_id, created_at desc)
  where is_portfolio = true;

-- =========================================================================
-- RLS additions
-- =========================================================================

-- Public read for portfolio-flagged photos belonging to approved helpers.
-- This is the policy that lights up the /providers/[id] gallery.
do $$ begin
  create policy "bcp_public_read_portfolio" on booking_completion_photos
    for select using (
      is_portfolio = true
      and exists (
        select 1 from provider_profiles pp
        where pp.user_id = booking_completion_photos.uploaded_by_user_id
          and pp.status = 'approved'
      )
    );
exception when duplicate_object then null; end $$;

-- Helper updates their own photo's portfolio flag + caption. Only allowed
-- after the booking has reached 'completed' status so a still-running task
-- can't accidentally become public.
do $$ begin
  create policy "bcp_helper_update_portfolio" on booking_completion_photos
    for update using (
      uploaded_by_user_id = auth.uid()
      and exists (
        select 1 from bookings b
        where b.id = booking_completion_photos.booking_id
          and b.provider_id = auth.uid()
          and b.status = 'completed'
      )
    ) with check (
      uploaded_by_user_id = auth.uid()
    );
exception when duplicate_object then null; end $$;

-- Customer of the booking can REVOKE portfolio status. The WITH CHECK
-- intentionally forces is_portfolio to false — the customer can take a
-- photo OUT of the helper's portfolio but not put it back in (only the
-- helper does that via the policy above). Keeps the consent model
-- asymmetric in the safer direction.
do $$ begin
  create policy "bcp_customer_revoke_portfolio" on booking_completion_photos
    for update using (
      exists (
        select 1 from bookings b
        where b.id = booking_completion_photos.booking_id
          and b.customer_id = auth.uid()
      )
    ) with check (
      is_portfolio = false
    );
exception when duplicate_object then null; end $$;
