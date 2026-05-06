-- ==============================================================
-- RUN THIS ENTIRE SCRIPT IN YOUR SUPABASE SQL EDITOR
-- Fully idempotent — safe to re-run at any time
-- ==============================================================

-- 1. Enable Realtime publication
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

-- 2. Create 'snippets' table
drop table if exists snippets cascade;
create table snippets (
  id uuid default gen_random_uuid() primary key,
  room_id text not null,
  text text not null,
  sender_id text not null,
  "timestamp" bigint not null
);

-- 3. Create 'rooms' table (no user_count — handled by Supabase Presence)
drop table if exists rooms cascade;
create table rooms (
  id text primary key,
  created_at bigint not null,
  last_activity bigint not null,
  status text default 'active' -- 'active' or 'cleanup'
);

-- 4. Create 'files' table
drop table if exists files cascade;
create table files (
  id uuid default gen_random_uuid() primary key,
  room_id text not null references rooms(id) on delete cascade,
  name text not null,
  size bigint not null,
  url text not null,
  "timestamp" bigint not null,
  storage_path text not null
);

-- 5. Add tables to Realtime publication
alter publication supabase_realtime add table snippets;
alter publication supabase_realtime add table files;
alter publication supabase_realtime add table rooms;

-- 6. Disable Row Level Security (open public sharing)
alter table snippets disable row level security;
alter table files disable row level security;
alter table rooms disable row level security;

-- 7. Indexes for performance
create index if not exists idx_files_room_id on files(room_id);
create index if not exists idx_snippets_room_id on snippets(room_id);
create index if not exists idx_rooms_status on rooms(status);
create index if not exists idx_rooms_last_activity on rooms(last_activity);

-- 8. Storage bucket for file uploads
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = excluded.public;

-- 9. Public access policy for uploads bucket
drop policy if exists "Public Access" on storage.objects;
create policy "Public Access"
on storage.objects for all
using (bucket_id = 'uploads');

-- 10. Migration: drop user_count if it exists from a previous schema run
--     (safe to run even if the column doesn't exist)
alter table rooms drop column if exists user_count;
