-- Let users dismiss their own notifications. Existing policies on the
-- notifications table cover SELECT + UPDATE (for marking read) — DELETE was
-- never added because the original UX bulk-marked everything read on
-- dropdown open. Adding a per-item dismiss X needs an explicit delete
-- policy, otherwise the row would silently fail to delete under RLS and
-- the user would see the item flicker back on next page load.

do $$ begin
  create policy "notif_self_delete" on notifications
    for delete using (user_id = auth.uid());
exception when duplicate_object then null; end $$;
