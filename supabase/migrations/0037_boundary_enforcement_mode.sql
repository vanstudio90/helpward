-- Make the emergency boundary exception visible to BOTH enforcement layers.
--
-- Review finding R08: the override replaced broadcast_request only, but a
-- request never reaches broadcast — resolveDispatchableAddress refuses
-- outside_boundary / no_dataset in the application before the request row
-- is created. So applying the documented override would not have restored
-- ordinary customer submission during a boundary-dataset incident. The
-- advertised scope and the real scope disagreed.
--
-- One piece of state now drives both layers. It governs ONLY boundary
-- containment. Address verification and placeholder rejection are not
-- expressible here and are never relaxed by anything.

create table if not exists operational_settings (
  key        text primary key,
  value      text not null,
  reason     text,
  set_by     text,
  set_at     timestamptz not null default now()
);

alter table operational_settings enable row level security;

-- Readable by signed-in users because the request form must know whether a
-- boundary exception is in force. It contains no secrets.
drop policy if exists ops_read on operational_settings;
create policy ops_read on operational_settings for select using (true);
drop policy if exists ops_admin_write on operational_settings;
create policy ops_admin_write on operational_settings for all
  using (is_admin()) with check (is_admin());

insert into operational_settings (key, value, reason, set_by)
values ('boundary_enforcement', 'enforced', 'default', 'migration 0037')
on conflict (key) do nothing;

-- 'enforced' (normal) or 'relaxed' (declared boundary incident).
create or replace function public.boundary_enforcement_mode()
returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from operational_settings where key = 'boundary_enforcement'),
    'enforced');
$$;

revoke execute on function public.boundary_enforcement_mode() from public;
grant execute on function public.boundary_enforcement_mode() to authenticated, service_role;

-- Declare / clear a boundary incident. Admin or service role only, and the
-- reason is mandatory — the same accountability the SQL override requires.
create or replace function public.set_boundary_enforcement(
  p_mode text, p_reason text, p_owner text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and jwt_role() not in ('admin', 'service_role') then
    raise exception 'set_boundary_enforcement: admins only';
  end if;
  if p_mode not in ('enforced', 'relaxed') then
    raise exception 'mode must be enforced or relaxed';
  end if;
  if p_mode = 'relaxed' and (coalesce(p_reason, '') = '' or coalesce(p_owner, '') = '') then
    raise exception 'relaxing boundary enforcement requires a reason and an owner';
  end if;

  insert into operational_settings (key, value, reason, set_by, set_at)
  values ('boundary_enforcement', p_mode, p_reason, p_owner, now())
  on conflict (key) do update
    set value = excluded.value, reason = excluded.reason,
        set_by = excluded.set_by, set_at = excluded.set_at;

  insert into audit_log (actor_id, action, target_table, target_id, payload)
  values (null,
    case when p_mode = 'relaxed' then 'BOUNDARY_ENFORCEMENT_RELAXED'
         else 'BOUNDARY_ENFORCEMENT_RESTORED' end,
    'operational_settings', null,
    jsonb_build_object('mode', p_mode, 'reason', p_reason, 'owner', p_owner, 'at', now(),
      'scope', 'municipal boundary containment only',
      'never_relaxed', jsonb_build_array('addresses.geocode_verified', 'is_placeholder_point')));
end;
$$;

revoke execute on function public.set_boundary_enforcement(text, text, text) from public;
grant execute on function public.set_boundary_enforcement(text, text, text) to authenticated, service_role;

comment on function public.boundary_enforcement_mode() is
  'Governs municipal boundary containment ONLY, in both the application guard and broadcast_request. Address verification and placeholder rejection are never relaxed by this or anything else.';
