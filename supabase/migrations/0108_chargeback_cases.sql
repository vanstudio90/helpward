-- CLASS: pre-deploy
-- =========================================================================
-- 0108 — a case can arrive from a bank
--
-- charge.dispute.created now opens a case (the webhook has claimed to
-- handle that event since it was written, and nothing did). But a
-- chargeback is opened by the card issuer: there is no Helpward
-- account behind it, and attributing it to the customer would put
-- words in their mouth — they may not have disputed anything, their
-- bank may have.
--
-- So opened_by becomes nullable, and who reported it is carried by
-- reported_by_name ("Stripe (card issuer)") and source instead.
-- =========================================================================

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'disputes'
                    and column_name = 'stripe_dispute_id') then
    raise exception 'REFUSING: disputes.stripe_dispute_id is missing. Apply 0104 first.';
  end if;
end $$;

alter table public.disputes alter column opened_by drop not null;

comment on column public.disputes.opened_by is
  'The account that opened it, where there is one. Null for a case that came from a bank or from an anonymous report; reported_by_name and source carry who it was in that case.';

-- One case per chargeback, whatever Stripe retries.
create unique index if not exists disputes_stripe_dispute_uniq
  on public.disputes (stripe_dispute_id) where stripe_dispute_id is not null;

do $$
declare
  v_case uuid;
  v_second uuid;
begin
  insert into disputes (booking_id, opened_by, category, description, status, kind,
                        source, stripe_dispute_id, reported_by_name, priority)
  values (null, null, 'billing',
          '0108 self-test: a chargeback with nobody behind it in our system.',
          'open', 'service', 'other', 'dp_0108_selftest', 'Stripe (card issuer)', 'urgent')
  returning id into v_case;

  -- The same chargeback cannot land twice.
  begin
    insert into disputes (booking_id, opened_by, category, description, status, kind,
                          source, stripe_dispute_id, reported_by_name)
    values (null, null, 'billing', 'duplicate attempt', 'open', 'service', 'other',
            'dp_0108_selftest', 'Stripe (card issuer)')
    returning id into v_second;
    raise exception '0108: the same chargeback opened a second case.';
  exception when unique_violation then null;
  end;

  delete from disputes where id = v_case;
end $$;
