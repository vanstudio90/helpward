-- Storage bucket for CCPA/PIPEDA/GDPR data exports.
--
-- Archives are JSON files written by /api/cron/process-data-exports and
-- handed to the user via a 7-day signed URL minted with the service role.
-- The bucket is private; nothing should ever be readable without going
-- through that signed-URL flow.
--
-- Path scheme: data-exports/{user_id}/{export_request_id}.json

insert into storage.buckets (id, name, public)
values ('data-exports', 'data-exports', false)
on conflict (id) do update set public = false;

-- Block direct reads at the policy level too. Reads are mediated server-side
-- through createSignedUrl, which the service role can do regardless of RLS.
drop policy if exists "data_exports_no_public_read" on storage.objects;
create policy "data_exports_no_public_read" on storage.objects
  for select using (bucket_id = 'data-exports' and false);

-- Only the cron (service role) writes here. We don't expose any direct-write
-- policy to authenticated users — there's no legitimate reason for a browser
-- session to put bytes into someone's export archive.
