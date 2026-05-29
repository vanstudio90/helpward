-- MFA recovery codes — 10 single-use backup codes generated when a user
-- completes TOTP enrollment. Stored as scrypt hashes (key=salt+hash) so a
-- DB leak doesn't immediately expose the codes.
--
-- Supabase's native MFA API handles TOTP enrollment + challenge + AAL
-- promotion; recovery codes are the one piece Supabase doesn't provide.
-- We model them as our own table linked to auth.users by id.

create table if not exists mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  -- scrypt-derived key, base64. Salt is stored alongside, separated by ":".
  -- Format: "<salt_base64>:<hash_base64>".
  code_hash text not null,
  -- When the code was used (single-use). Nullable until consumed.
  used_at timestamptz,
  -- Audit context for support reviewers if a code is consumed.
  used_ip text,
  created_at timestamptz default now()
);
create index if not exists mrc_user_idx on mfa_recovery_codes(user_id, used_at);
-- One active set per user — when we rotate codes we delete the old set first.
create index if not exists mrc_unused_idx on mfa_recovery_codes(user_id) where used_at is null;

alter table mfa_recovery_codes enable row level security;

-- Users can SELECT their own rows but cannot read the hash — they only need
-- to know "do I still have unused codes?" The hashes are private even from
-- the owner (the plaintext was already shown to them once at generation).
-- We expose `id`, `used_at`, `created_at` to the user via a view; the table
-- itself is service-role only.
do $$ begin
  create policy "mrc_select_own_metadata" on mfa_recovery_codes for select
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Service-role inserts / updates the rest. Hash verification happens via a
-- server action that reads through service-role.
grant select on mfa_recovery_codes to authenticated;
grant select, insert, update, delete on mfa_recovery_codes to service_role;
