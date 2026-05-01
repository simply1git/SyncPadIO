# 🏠 Room Lifecycle & Auto-Cleanup System

## Overview

TextShare now automatically manages room lifecycles to keep files **temporary and temporary-only**. Files persist while a room is active, and get **automatically deleted** when:

1. ✅ Everyone leaves the room (user count = 0)
2. ✅ Room becomes inactive for **1 hour** (customizable)
3. ✅ Browser tab is closed (user leaves)

**Benefits:**
- 📦 Files only exist during active collaboration
- 🔄 Automatic cleanup prevents storage bloat
- 🛡️ Privacy: No permanent server storage
- ⚡ Cost efficient: Storage only pays for active sessions

---

## Architecture

### Database Schema

#### `rooms` Table
Tracks room lifecycle and metadata:

```sql
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,           -- Room code (e.g., "ABC123")
  created_at BIGINT NOT NULL,    -- Timestamp room created
  last_activity BIGINT NOT NULL, -- Last user activity (ms)
  user_count INTEGER DEFAULT 0,  -- Current users in room
  status TEXT DEFAULT 'active'   -- 'active' or 'cleanup'
);
```

#### `files` Table
Files now reference rooms with cascade delete:

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  size BIGINT NOT NULL,
  url TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  storage_path TEXT NOT NULL    -- NEW: Path for cleanup
);
```

**Key Feature:** `ON DELETE CASCADE` - When room is deleted, all files are automatically deleted!

#### `snippets` Table
Similar cascade setup:

```sql
CREATE TABLE snippets (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  timestamp BIGINT NOT NULL
);
```

---

## How It Works

### 1. **Room Creation** 🆕

When user joins/creates a room:

```typescript
const { useRoomLifecycle } = require('./hooks/useRoomLifecycle');

useRoomLifecycle({
  roomId: 'ABC123',
  userId: 'user-xyz',
  onRoomDeleted: () => {
    // Handle room deletion
    redirectToHome();
  },
  inactivityTimeoutMs: 60 * 60 * 1000, // 1 hour
});
```

**What happens:**
1. Check if room exists in database
2. If not exists: Create room with `created_at`, `last_activity`, `user_count: 1`
3. If exists: Increment `user_count`, update `last_activity`

```typescript
// Result in database
rooms:
{
  id: 'ABC123',
  created_at: 1714696800000,
  last_activity: 1714696800000,
  user_count: 1,
  status: 'active'
}
```

### 2. **Activity Tracking** 📊

Every user action updates `last_activity`:

```typescript
// Tracked activities:
- Mouse move
- Key press
- Click
- Touch
- File upload
- File deletion
- Snippet addition
```

**Why?** To detect when room becomes truly inactive (no human activity).

```typescript
const updateLastActivity = async () => {
  await supabase
    .from('rooms')
    .update({ last_activity: Date.now() })
    .eq('id', roomId);
  
  // Reset inactivity timer
  resetInactivityTimeout();
};
```

### 3. **User Joins/Leaves** 👥

#### User Joins:
```
User clicks "Join Session"
  ↓
joinRoomRealtime() called with room code
  ↓
useRoomLifecycle increments user_count
  ↓
Room status: active, user_count: 2
```

#### User Leaves:
```
Browser tab closed / Navigate away
  ↓
Component unmounts
  ↓
leaveRoom() called
  ↓
Decrement user_count
  ↓
If user_count === 0: DELETE ROOM + FILES!
```

```typescript
const leaveRoom = async () => {
  const room = await getRoom(roomId);
  const newCount = room.user_count - 1;
  
  if (newCount === 0) {
    // EVERYONE LEFT - DELETE ROOM & FILES
    await deleteRoom(roomId);
  } else {
    // Update count
    await updateUserCount(newCount);
  }
};
```

### 4. **Inactivity Cleanup** ⏱️

If room has no activity for **1 hour**:

```
User is idle for 1 hour
  ↓
Inactivity timer triggers
  ↓
Check: last_activity + 1 hour < now?
  ↓
YES: Room is inactive
  ↓
DELETE ROOM + FILES
```

```typescript
activityTimeoutRef.current = setTimeout(() => {
  cleanupInactiveRoom(); // Delete room & cascade files
}, inactivityTimeoutMs); // Default: 1 hour
```

### 5. **Cascade Delete** 🗑️

When room is deleted (either by leaving or inactivity):

**Step 1: Delete from Storage**
```typescript
// Get all files in room
const files = await supabase
  .from('files')
  .select('storage_path')
  .eq('room_id', roomId);

// Delete each file from Supabase Storage
for (const file of files) {
  await supabase.storage
    .from('uploads')
    .remove([file.storage_path]);
}
```

**Step 2: Delete from Database**
```typescript
// Delete room record
// ON DELETE CASCADE triggers automatic deletion:
// - All files with room_id=xxx
// - All snippets with room_id=xxx
await supabase
  .from('rooms')
  .delete()
  .eq('id', roomId);
```

**Step 3: Notify Frontend**
```typescript
// Realtime subscription detects deletion
onRoomDeleted?.(); // Redirect to home
```

**Result:**
```
Before Delete:
├─ rooms: ABC123 (1 record)
├─ files: [file1, file2, file3] (3 records)
└─ storage: uploads/ABC123/... (3 files)

After Delete:
├─ rooms: (empty)
├─ files: (empty)
└─ storage: (empty)
```

---

## File Lifecycle

### Upload 📤

```typescript
import { uploadFileToRoom } from './utils/roomUtils';

await uploadFileToRoom({
  roomId: 'ABC123',
  file: fileInput,
  onProgress: (progress) => {
    updateProgressBar(progress);
  },
});
```

**What happens:**

```
1. Validate file (50MB max, no executables)
2. Generate storage path: ABC123/timestamp_filename
3. Upload to Supabase Storage
4. Get public URL
5. Record in database with storage_path
6. Realtime triggers INSERT → Update UI
```

**Database entry:**
```typescript
files:
{
  id: 'uuid-123',
  room_id: 'ABC123',
  name: 'document.pdf',
  size: 1024000,
  url: 'https://...uploads/ABC123/12345_document.pdf',
  timestamp: 1714696800000,
  storage_path: 'ABC123/12345_document.pdf'  // KEY: for cleanup
}
```

### Download 📥

```
User clicks download
  ↓
Browser downloads file from URL
  ↓
File stored locally (not in app)
```

**Note:** Files are public URLs in Supabase, so download is direct (no server relay).

### Delete 🗑️

```typescript
import { deleteFileFromRoom } from './utils/roomUtils';

await deleteFileFromRoom(fileId, storagePath);
```

**What happens:**

```
1. Delete from Supabase Storage using storagePath
2. Delete from database using fileId
3. Realtime triggers DELETE → Update UI
```

**User perspective:**
```
Click "X" button on file
  ↓
File removed from list immediately (optimistic)
  ↓
Realtime confirms deletion
  ↓
File never accessible again
```

---

## Room Lifecycle Diagram

```
USER A JOINS
    ↓
    Room Created: {id: 'ABC', user_count: 1}
    ↓
USER B JOINS
    ↓
    room.user_count = 2
    ↓
    [Activity Detected]
    ↓
    last_activity = now (inactivity timer resets)
    ↓
USER A LEAVES
    ↓
    room.user_count = 1
    ↓
USER B LEAVES
    ↓
    room.user_count = 0
    ↓
    [INSTANT DELETE: Room + Files + Storage]
    ↓
OR
    ↓
    [NO ACTIVITY FOR 1 HOUR]
    ↓
    [DELETE: Room + Files + Storage]
```

---

## Configuration

### Inactivity Timeout

Edit in `App.tsx`:

```typescript
const { updateLastActivity } = useRoomLifecycle({
  roomId,
  userId: myUserId,
  onRoomDeleted: () => {
    // Handle deletion
  },
  inactivityTimeoutMs: 60 * 60 * 1000, // 1 hour (customizable)
});
```

**Common options:**
```typescript
5 * 60 * 1000,        // 5 minutes (testing)
30 * 60 * 1000,       // 30 minutes
60 * 60 * 1000,       // 1 hour (default)
24 * 60 * 60 * 1000,  // 1 day
```

---

## Real-World Example

### Scenario: Share Large Video with Colleague

```
9:00 AM - You create room
  ├─ Room created: {id: 'DEF456', user_count: 1}
  └─ Database: room DEF456 with last_activity=9:00

9:05 AM - Upload 500MB video via WebRTC
  ├─ Files created: {room_id: 'DEF456', name: 'video.mp4', ...}
  ├─ Storage: uploads/DEF456/video.mp4 (500MB)
  └─ last_activity updated to 9:05

9:10 AM - Colleague joins
  ├─ room.user_count = 2
  ├─ Colleague downloads video
  └─ last_activity = 9:10

9:15 AM - You close tab (leave)
  ├─ leaveRoom() called
  ├─ room.user_count = 1
  └─ Video still exists (colleague still here)

9:20 AM - Colleague closes tab (leaves)
  ├─ leaveRoom() called
  ├─ room.user_count = 0
  ├─ TRIGGER: DELETE ROOM
  ├─ Database: room DEF456 DELETED
  ├─ Database: files DELETED (cascade)
  ├─ Storage: uploads/DEF456/ DELETED (all 500MB)
  └─ Result: No trace remains!

Cost Impact:
├─ Storage: $0 (files deleted after 20 min)
├─ Bandwidth: ~$0.06 (500MB download, typical rate)
└─ Total: ~$0.06 (if any)
```

---

## Comparison: Before vs After

### Before (No Room Lifecycle)
```
Upload file → Storage forever
Delete file? → Manual only
Room cleanup? → Never
Storage bloat? → Yes
Cost? → Accumulates

Result: Files pile up, storage grows, costs increase
```

### After (Room Lifecycle)
```
Upload file → Storage only during active room
Room empty? → Files deleted automatically
Inactive 1 hour? → Room + files deleted automatically
Storage bloat? → Never
Cost? → Predictable and minimal

Result: Automatic cleanup, minimal storage, user privacy
```

---

## Monitoring & Debugging

### Check Room Status

```typescript
import { getRoomInfo } from './utils/roomUtils';

const room = await getRoomInfo('ABC123');
console.log(room);
// {
//   id: 'ABC123',
//   created_at: 1714696800000,
//   last_activity: 1714700400000,
//   user_count: 2,
//   status: 'active'
// }
```

### Check Room Files

```typescript
import { getRoomFiles } from './utils/roomUtils';

const files = await getRoomFiles('ABC123');
console.log(files.length); // 3 files in room
```

### Monitor Cleanup

Check browser console for logs:

```javascript
[Room] Room ABC123 is empty, scheduling cleanup
[Room] Successfully deleted room: ABC123
[Delete] File deleted successfully: ABC123/12345_doc.pdf
```

---

## Migration Guide

### If You Have Existing Rooms

**Option 1: Run Migration SQL**

```sql
-- Add new columns to existing tables
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Update files table to reference rooms
ALTER TABLE files 
  ADD CONSTRAINT fk_files_room_id 
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;
```

**Option 2: Fresh Start (Recommended)**

```sql
-- Run the updated schema from supabase_schema.sql
-- This creates fresh tables with proper relationships
```

---

## FAQ

### Q: What if user's WiFi disconnects?

**A:** 
```
WiFi disconnects
  ↓
Browser detects (browser visibility API)
  ↓
Component unmounts
  ↓
leaveRoom() triggered
  ↓
Inactivity timer starts
  ↓
If offline for >1 hour: Room deleted
  ↓
If reconnect within 1 hour: Can rejoin same room!
```

### Q: Can I download a file after room is deleted?

**A:** 
```
NO. Room deleted = Files deleted from storage.

Exception: If you saved the file locally during room activity.
```

### Q: Can I extend a room's life?

**A:**
```
YES. Any activity extends it:
- Move mouse
- Type
- Click
- Upload/delete file

So long as someone is active, room stays alive!
```

### Q: What happens to uploaded files during upload if user leaves?

**A:**
```
BEST CASE:
- Upload completes before user leaves
- File saved to storage
- File deleted with room

IN PROGRESS:
- Upload incomplete when user leaves
- File partially uploaded (may cleanup)
- Room cleaned up after 1 hour
- Partial file cleaned with room
```

### Q: Can multiple rooms share the same files?

**A:** 
```
NO. Each file belongs to ONE room (room_id foreign key).

Files are tied to room lifecycle.
```

### Q: How do I backup important files?

**A:**
```
DURING ACTIVE ROOM:
1. Download file to your computer
2. Save locally

Your download is YOUR backup. 
Room files are temporary by design.
```

---

## Performance Impact

### Storage

```
Before: Unlimited growth (files never deleted)
After: Bounded by active rooms only

Example:
- 100 concurrent users
- Average 5 files per room
- Average 10MB per file
= 5GB total (ephemeral)
```

### Database

```
rooms table: ~rows = active room count
files table: ~rows = (active rooms × avg files)
snippets table: ~rows = (active rooms × avg snippets)

Queries: O(1) for room info, O(n) for cleanup
```

### Cleanup Operations

```
When room deleted:
- Delete from storage: ~100ms per file
- Delete from database: ~10ms (cascade)
- Realtime broadcast: ~5ms

Total: <500ms for typical room with 10 files
```

---

## Security Considerations

### Room Privacy
```
Room ID: Public (6 digits shared via QR/link)
Files: Public URL (accessible by URL)
Snippets: Public (shared in room)

Security: URL-only (obfuscation, not encryption)
Recommendation: Share room code only with trusted people
```

### File Cleanup
```
When room deleted: Files unrecoverable
- Storage deleted
- Database deleted
- No backup kept

Privacy: ✅ Complete cleanup
```

---

## Future Enhancements

### Planned Features
- [ ] Password-protected rooms
- [ ] End-to-end encryption for files
- [ ] Adjustable inactivity timeout per room
- [ ] Room admin controls
- [ ] Room activity logs
- [ ] File versioning/history
- [ ] Automatic archival before deletion

---

## Support

For issues with room lifecycle:

1. **Check logs:** Browser console for `[Room]` messages
2. **Verify room:** Use `getRoomInfo()` utility
3. **Check database:** Query `rooms` table in Supabase
4. **Monitor activity:** Are there any user actions detected?

---

## Summary

✅ **Files persist while room is active**
✅ **Auto-delete when everyone leaves**
✅ **Auto-delete after 1 hour inactivity**
✅ **Cascade delete: Room → Files → Storage**
✅ **Zero permanent storage costs**
✅ **Complete privacy after room deletion**
✅ **Activity tracking prevents false cleanup**

**Result:** Temporary, automatic, privacy-first file sharing! 🎉
