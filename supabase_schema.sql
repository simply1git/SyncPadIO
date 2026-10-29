-- ==============================================================
-- SYNC-PAD-IO SUPABASE PRODUCTION SCHEMA (V2.0)
-- RUN THIS ENTIRE SCRIPT IN YOUR SUPABASE SQL EDITOR
-- Fully idempotent — safe to re-run at any time
-- ==============================================================

-- 1. Enable Realtime publication
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

-- 2. Create 'rooms' table
create table if not exists rooms (
  id text primary key,
  created_at bigint not null,
  last_activity bigint not null,
  status text default 'active' -- 'active' or 'cleanup'
);

-- 3. Create 'snippets' table
create table if not exists snippets (
  id uuid default gen_random_uuid() primary key,
  room_id text not null references rooms(id) on delete cascade,
  text text not null,
  sender_id text not null,
  sender_name text,
  "timestamp" bigint not null
);

-- 4. Create 'files' table
create table if not exists files (
  id uuid default gen_random_uuid() primary key,
  room_id text not null references rooms(id) on delete cascade,
  name text not null,
  size bigint not null,
  url text not null,
  "timestamp" bigint not null,
  storage_path text not null,
  uploader_name text
);

-- 5. Add tables to Realtime publication
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table snippets;
alter publication supabase_realtime add table files;

-- 6. Enable Row Level Security (RLS) for Secure Ephemeral Sharing
alter table rooms enable row level security;
alter table snippets enable row level security;
alter table files enable row level security;

-- Drop any legacy policies to maintain idempotency
drop policy if exists "Allow public read rooms" on rooms;
drop policy if exists "Allow public insert rooms" on rooms;
drop policy if exists "Allow public update rooms" on rooms;
drop policy if exists "Allow public delete rooms" on rooms;

drop policy if exists "Allow public read snippets" on snippets;
drop policy if exists "Allow public insert snippets" on snippets;
drop policy if exists "Allow public delete snippets" on snippets;

drop policy if exists "Allow public read files" on files;
drop policy if exists "Allow public insert files" on files;
drop policy if exists "Allow public delete files" on files;

-- 7. Define Policies for Rooms
create policy "Allow public read rooms"
  on rooms for select
  using (true);

create policy "Allow public insert rooms"
  on rooms for insert
  with check (length(id) >= 2 and length(id) <= 24);

create policy "Allow public update rooms"
  on rooms for update
  using (true)
  with check (true);

create policy "Allow public delete rooms"
  on rooms for delete
  using (true);

-- 8. Define Policies for Snippets (scoped to valid room)
create policy "Allow public read snippets"
  on snippets for select
  using (true);

create policy "Allow public insert snippets"
  on snippets for insert
  with check (length(room_id) >= 2 and length(text) <= 500000);

create policy "Allow public delete snippets"
  on snippets for delete
  using (true);

-- 9. Define Policies for Files (scoped to valid room)
create policy "Allow public read files"
  on files for select
  using (true);

create policy "Allow public insert files"
  on files for insert
  with check (length(room_id) >= 2 and size <= 52428800); -- Max 50MB enforced at DB level

create policy "Allow public delete files"
  on files for delete
  using (true);

-- 10. Indexes for fast real-time queries
create index if not exists idx_rooms_status on rooms(status);
create index if not exists idx_rooms_last_activity on rooms(last_activity);
create index if not exists idx_snippets_room_id on snippets(room_id);
create index if not exists idx_snippets_timestamp on snippets("timestamp");
create index if not exists idx_files_room_id on files(room_id);
create index if not exists idx_files_timestamp on files("timestamp");

-- 11. Storage bucket for file uploads
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do update set public = excluded.public;

-- 12. Storage policies for uploads bucket
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Public Upload Access" on storage.objects;
drop policy if exists "Public Delete Access" on storage.objects;

create policy "Public Access"
  on storage.objects for select
  using (bucket_id = 'uploads');

create policy "Public Upload Access"
  on storage.objects for insert
  with check (bucket_id = 'uploads');

create policy "Public Delete Access"
  on storage.objects for delete
  using (bucket_id = 'uploads');

-- 13. Cleanup Migration
alter table rooms drop column if exists user_count;
