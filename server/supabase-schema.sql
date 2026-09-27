-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).
-- Mirrors the key/value + media interface used by store-fs.mjs.

create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists media (
  id text primary key,
  content_type text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

-- Server code only ever uses the secret key, which bypasses RLS, but enabling
-- RLS with no policies still blocks any client that used the publishable key.
alter table kv_store enable row level security;
alter table media enable row level security;

grant select, insert, update, delete on kv_store to service_role;
grant select, insert, update, delete on media to service_role;
