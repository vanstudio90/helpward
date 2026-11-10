-- CLASS: pre-deploy
-- =========================================================================
-- 0097 — two things 0088 left behind, both found by the SQL suites
--
-- A pre-upload sanity run turned up a failing assertion and an aborted
-- suite. Neither is cosmetic, and the second one is live in production.
--
-- ONE: broadcast_request CANNOT RECORD WHY IT GAVE UP.
--
-- 0034 created dispatch_refusals with a CHECK listing the six reasons
-- that existed then. 0088 rewrote broadcast_request and gave three of
-- its refusal paths NEW names — none of which are in that list:
--
--     emitted by broadcast_request        in the CHECK?
--     ───────────────────────────────     ─────────────
--     no_pickup_location                  yes
--     address_unverified                  yes
--     boundary_no_dataset                 yes
--     boundary_outside                    yes
--     placeholder_point                   NO  (the list says address_placeholder)
--     no_providers_in_range               NO  (the list says no_eligible_helper)
--     no_review_helper_online             NO  (did not exist in 0034)
--
-- record_dispatch_refusal inserts the string it is handed, unchanged. So
-- on those three paths the insert violates the constraint, the exception
-- unwinds the whole of broadcast_request, and the caller —
-- broadcastRequestBestEffort, best-effort by design — logs it and
-- carries on.
--
-- WHAT THAT LOOKS LIKE TO A CUSTOMER: the request sits in 'matching'
-- with no match_attempts, no refusal row, and no `dispatch_blocked`
-- notification to any admin. Nobody is offered the job and nothing says
-- why. `no_providers_in_range` is the ordinary low-supply path, which
-- with three approved helpers is the path most real requests take right
-- now — so this is not an edge case, it is the common one.
--
-- WIDENED RATHER THAN RENAMED. Changing the function's strings would
-- mean reissuing 0088's body to alter three literals, and the names it
-- uses are the better ones: `placeholder_point` says which check fired,
-- `no_providers_in_range` says it was distance rather than eligibility.
-- The two older spellings stay valid so existing rows keep passing —
-- they are history, and nothing in the application reads this table
-- (verified: only scripts/verify-migration-state.mjs and the SQL suite
-- touch it).
--
-- TWO: broadcast_request IS EXECUTABLE BY `authenticated`.
--
-- 0036 revoked it and said why; 0038 revoked it again. 0088 ended with
-- `grant execute … to authenticated, service_role`, which handed it back
-- — and quote_integrity.sql has been failing on exactly that assertion:
--
--     FAIL public.broadcast_request(uuid,int) executable by authenticated=t anon=f
--
-- It is SECURITY DEFINER and takes a request id and a radius, so any
-- signed-in account could dispatch somebody else's request, at a radius
-- of its choosing. Nothing legitimate needs that: all four callers
-- (new-request actions ×2, the recurring-series action, and
-- /api/v1/requests) pass the SERVICE client. Revoked again here.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 0. The assumptions, checked out loud.
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.dispatch_refusals'::regclass
       and conname = 'dispatch_refusals_reason_check'
  ) then
    raise exception
      'REFUSING: dispatch_refusals_reason_check is not there under that name. Apply 0034 first, or look at what renamed it.';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'broadcast_request'
  ) then
    raise exception 'REFUSING: public.broadcast_request does not exist.';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- 1. Every reason the dispatcher can actually emit.
-- -------------------------------------------------------------------------
alter table public.dispatch_refusals
  drop constraint dispatch_refusals_reason_check;

alter table public.dispatch_refusals
  add constraint dispatch_refusals_reason_check check (reason in (
    -- Written by broadcast_request as it stands today (0088).
    'no_pickup_location',       -- request has no usable address row
    'address_unverified',       -- pickup never passed geocode verification
    'placeholder_point',        -- coordinates are the known placeholder point
    'boundary_no_dataset',      -- no active official boundary set loaded
    'boundary_outside',         -- pin is outside every active boundary
    'no_providers_in_range',    -- everything checked out; nobody near enough
    'no_review_helper_online',  -- same, for an App Review account's request
    -- 0034's spellings for the first two of those. Nothing writes them
    -- any more; they are kept so rows written before 0088 stay legal.
    'address_placeholder',
    'no_eligible_helper'
  ));

comment on constraint dispatch_refusals_reason_check on public.dispatch_refusals is
  'The reasons broadcast_request emits, plus two legacy spellings. A reason missing from this list does not get logged — it throws inside the dispatcher and the broadcast is lost.';

-- -------------------------------------------------------------------------
-- 2. Dispatch is the server's to start, not a signed-in client's.
-- -------------------------------------------------------------------------
revoke execute on function public.broadcast_request(uuid, int) from public, anon, authenticated;
grant execute on function public.broadcast_request(uuid, int) to service_role;

-- -------------------------------------------------------------------------
-- 3. Prove it, here, rather than trusting the two statements above.
--
-- The reasons are inserted for real and rolled back — a constraint that
-- accepts them is the only evidence worth having, and asserting the list
-- against itself would prove nothing.
-- -------------------------------------------------------------------------
do $$
declare
  v_request uuid;
  v_reason text;
begin
  select id into v_request from requests limit 1;
  if v_request is null then
    raise notice '0097: no request rows to test the constraint against; skipped.';
  else
    foreach v_reason in array array[
      'no_pickup_location', 'address_unverified', 'placeholder_point',
      'boundary_no_dataset', 'boundary_outside', 'no_providers_in_range',
      'no_review_helper_online'
    ] loop
      begin
        insert into dispatch_refusals (request_id, reason, detail)
        values (v_request, v_reason, '0097 self-test');
      exception when check_violation then
        raise exception '0097: the constraint still refuses %, which broadcast_request emits.', v_reason;
      end;
    end loop;
    -- Written only to be removed: these are not real refusals.
    delete from dispatch_refusals where detail = '0097 self-test';
  end if;

  if has_function_privilege('authenticated', 'public.broadcast_request(uuid, int)', 'execute') then
    raise exception '0097: authenticated can still execute broadcast_request.';
  end if;
  if not has_function_privilege('service_role', 'public.broadcast_request(uuid, int)', 'execute') then
    raise exception '0097: service_role lost execute on broadcast_request.';
  end if;
end $$;
