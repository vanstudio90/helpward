-- CLASS: pre-deploy
-- Quote identity — ADDITIVE, pre-deploy safe.
--
-- Split out of 0036 because the new application calls seal_bundle_quote()
-- the moment it deploys, while the rest of 0036 is deploy-coupled (its
-- request_bundle_items trigger rejects the OLD release's writes). Applying
-- 0036 after the deploy therefore left a window in which the new app called
-- an RPC that did not exist yet, and every bundle submission failed.
--
-- A live audit hit a bundle crash on the previous release for a different
-- reason, which is what prompted checking this: the window was real.
--
-- Nothing here constrains any writer, so the old release is unaffected:
-- it simply never calls these.

-- =========================================================================
-- D02 — the whole quote structure is immutable once offered, not just price
-- =========================================================================
--
-- Freezing item_price_cents was not enough. rbi_write_own (0015) is FOR
-- ALL, so a customer could DELETE a stop; the UPDATE trigger did not freeze
-- request_id, so a stop could be reparented; and req_update (0002) let the
-- customer edit requests.bundle_item_count, so the acceptance count check
-- could be made to agree with a shortened bundle. A three-stop offer could
-- become a two-stop booking after the helper accepted what they saw.
--
-- The fix is an immutable quote identity. seal_bundle_quote() records a
-- fingerprint of the stop set at creation; acceptance recomputes it and
-- refuses if anything about the quote changed.

alter table requests
  add column if not exists quote_fingerprint text;

comment on column requests.quote_fingerprint is
  'Hash of the bundle stop set (service ids, prices, positions) at the moment the request was created. accept_request recomputes it and refuses if the bundle changed after the offer went out.';

create or replace function public.compute_bundle_fingerprint(p_request_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  -- Core sha256(bytea), not pgcrypto's digest().
  --
  -- On Supabase pgcrypto is installed into the `extensions` schema, and
  -- this function pins `search_path = public` (as every SECURITY DEFINER
  -- function here does, to stop search_path games). digest() is therefore
  -- invisible and the migration failed with
  -- "function digest(text, unknown) does not exist" the first time it was
  -- applied to a real database. sha256() is built into Postgres 11+, needs
  -- no extension, and cannot be shadowed.
  select encode(sha256(convert_to(coalesce(string_agg(
           i.position || ':' || i.service_id || ':' || i.item_price_cents, '|'
           order by i.position, i.service_id), ''), 'UTF8')), 'hex')
  from request_bundle_items i
  where i.request_id = p_request_id;
$$;

create or replace function public.seal_bundle_quote(p_request_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_fp text;
  v_count int;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and jwt_role() <> 'service_role' then
    raise exception 'seal_bundle_quote: service role only';
  end if;

  select count(*) into v_count from request_bundle_items where request_id = p_request_id;
  if v_count < 2 then
    raise exception 'cannot seal a bundle with % stop(s)', v_count;
  end if;

  v_fp := compute_bundle_fingerprint(p_request_id);
  update requests
     set quote_fingerprint = v_fp, bundle_item_count = v_count
   where id = p_request_id;
  return v_fp;
end;
$$;


-- Grant hygiene here, not in 0036: these functions are callable from the
-- moment they exist, and Postgres grants EXECUTE to PUBLIC by default.
revoke execute on function public.compute_bundle_fingerprint(uuid) from public, anon, authenticated;
revoke execute on function public.seal_bundle_quote(uuid) from public, anon, authenticated;
grant execute on function public.compute_bundle_fingerprint(uuid) to service_role;
grant execute on function public.seal_bundle_quote(uuid) to service_role;
