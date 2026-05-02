# 🚀 SyncPadIO Supabase Setup Guide

## Step 1: Create Supabase Tables

You must run the SQL schema in your Supabase SQL editor:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **SQL Editor** → Click **"New Query"**
4. Copy and paste the entire SQL schema below
5. Click **"Run"**

## SQL Schema to Run:

```sql
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

-- 3. Create 'rooms' table for lifecycle management
create table rooms (
  id text primary key,
  created_at bigint not null,
  last_activity bigint not null,
  user_count integer default 0,
  status text default 'active'
);

-- 4. Create 'files' table
create table files (
  id uuid default gen_random_uuid() primary key,
  room_id text not null references rooms(id) on delete cascade,
  name text not null,
  size bigint not null,
  url text not null,
  timestamp bigint not null,
  storage_path text not null
);

-- 5. Add tables to Realtime publication
alter publication supabase_realtime add table snippets;
alter publication supabase_realtime add table files;
alter publication supabase_realtime add table rooms;

-- 6. Disable Row Level Security (RLS) for public sharing
alter table snippets disable row level security;
alter table files disable row level security;
alter table rooms disable row level security;

-- 7. Create indexes for performance
create index idx_files_room_id on files(room_id);
create index idx_snippets_room_id on snippets(room_id);
create index idx_rooms_status on rooms(status);
create index idx_rooms_last_activity on rooms(last_activity);

-- 8. Set up Storage bucket
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true);

-- 9. Allow public access to storage
create policy "Public Access" on storage.objects for all using ( bucket_id = 'uploads' );
```

## Step 2: Verify Tables Created

After running the SQL:

1. Go to **Table Editor** in Supabase
2. You should see these tables:
   - ✅ `rooms`
   - ✅ `snippets`
   - ✅ `files`
   - ✅ `storage.buckets` (uploads)

## Step 3: Test Connection

1. Visit https://sync-pad-io.vercel.app/
2. Click **"Start New Session"**
3. Check the browser console (F12 → Console)
4. If no errors, it's working! ✅

## Troubleshooting

### Still Getting 404 Errors?

**Check 1**: Verify tables exist in Supabase
```sql
SELECT * FROM information_schema.tables WHERE table_schema = 'public';
```

**Check 2**: Verify Realtime is enabled
- Go to **Settings** → **Realtime** → Enable for `snippets`, `files`, `rooms`

**Check 3**: Check RLS policies
```sql
SELECT * FROM pg_policies WHERE tablename IN ('snippets', 'files', 'rooms');
```

### WebSocket Connection Failed?

This may be a temporary network issue. Refresh the page and try again.

## Next Steps

After setup:
1. Test creating/joining sessions
2. Share text snippets
3. Upload files
4. Verify real-time sync works

Questions? Check the [full documentation](./INDEX.md)
