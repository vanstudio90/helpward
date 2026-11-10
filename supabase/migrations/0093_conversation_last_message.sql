-- CLASS: pre-deploy
-- =========================================================================
-- 0093 — last_message_at is maintained by the database
--
-- `conversations.last_message_at` has never moved. It is set once by its
-- own `default now()` at creation (0001) and then nothing updates it,
-- because conversations carries a SELECT policy and no UPDATE policy
-- (0002). RLS is enabled on the table, so the client's update matches
-- zero rows and the client wraps it in `try?` — which is exactly why
-- this went unnoticed: the write has been failing silently for the life
-- of the feature.
--
-- The consequence is on every messages list, both sides: they order by
-- this column, so a thread never rises when it receives a message, and
-- the timestamp under each row is the moment the conversation was
-- created rather than the moment anyone last spoke.
--
-- DONE AS A TRIGGER, NOT A POLICY. Granting the client an UPDATE would
-- work and would be worse: it is a second round-trip that can fail on
-- its own, and it lets a client write any timestamp it likes, including
-- one in the future, which reorders somebody else's list. A trigger
-- writes the server's own `created_at` in the same transaction as the
-- insert, so the column cannot disagree with the message that caused it.
--
-- security definer because there is deliberately still no UPDATE policy:
-- the database may move this column and nobody else may.
-- =========================================================================

create or replace function public.bump_conversation_last_message()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations
     set last_message_at = new.created_at
   where id = new.conversation_id
     -- Never move it backwards. Messages can arrive out of order after a
     -- retry, and a late insert of an older message must not make a
     -- conversation look staler than its newest one.
     and (last_message_at is null or last_message_at < new.created_at);
  return new;
end $$;

drop trigger if exists messages_bump_conversation on messages;
create trigger messages_bump_conversation
  after insert on messages
  for each row execute function public.bump_conversation_last_message();

-- Existing rows carry a creation stamp. Correct them from the messages
-- that are already there, so the first list anybody opens after this
-- lands is right rather than right-from-now-on.
update conversations c
   set last_message_at = m.newest
  from (
    select conversation_id, max(created_at) as newest
      from messages
     group by conversation_id
  ) m
 where m.conversation_id = c.id
   and (c.last_message_at is null or c.last_message_at < m.newest);

comment on column conversations.last_message_at is
  'Maintained by messages_bump_conversation (0093). Clients cannot write it: there is no UPDATE policy, by design.';
