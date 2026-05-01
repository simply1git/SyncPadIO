-- ==============================================================
-- RUN THIS ENTIRE SCRIPT IN YOUR SUPABASE SQL EDITOR
-- ==============================================================

-- 1. Enable Realtime publication
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

-- 2. Create 'snippets' table
create table snippets (
  id uuid default gen_random_uuid() primary key,
  room_id text not null,
  text text not null,
  sender_id text not null,
  timestamp bigint not null
);

-- 3. Create 'files' table
create table files (
  id uuid default gen_random_uuid() primary key,
  room_id text not null,
  name text not null,
  size bigint not null,
  url text not null,
  timestamp bigint not null
);

-- 4. Add tables to Realtime publication so clients can listen to changes
alter publication supabase_realtime add table snippets;
alter publication supabase_realtime add table files;

-- 5. Disable Row Level Security (RLS) for public sharing
alter table snippets disable row level security;
alter table files disable row level security;

-- 6. Set up Storage bucket for file uploads
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true);

-- 7. Allow public access to the 'uploads' bucket
create policy "Public Access" on storage.objects for all using ( bucket_id = 'uploads' );
