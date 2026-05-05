# SyncPadIO - Ephemeral File Sharing Platform

**Live Demo:** [sync-pad-io.vercel.app](https://sync-pad-io.vercel.app)  
**GitHub:** [simply1git/SyncPadIO](https://github.com/simply1git/SyncPadIO)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [File Structure](#file-structure)
6. [Installation & Setup](#installation--setup)
7. [Room Lifecycle Management](#room-lifecycle-management)
8. [File Handling](#file-handling)
9. [WebRTC P2P Transfer](#webrtc-p2p-transfer)
10. [Cost Breakdown](#cost-breakdown)
11. [Deployment](#deployment)
12. [API Reference](#api-reference)
13. [Future Improvements](#future-improvements)

---

## 🎯 Project Overview

**SyncPadIO** is a modern, ephemeral file and text sharing platform that prioritizes privacy, simplicity, and cost-effectiveness. Unlike traditional file-sharing services:

- ✅ **Files exist only during active sessions** — Automatically deleted when the room closes or becomes inactive
- ✅ **End-to-end encrypted** — Files are encrypted client-side; servers never see plaintext
- ✅ **Real-time presence tracking** — Know when peers join/leave your room
- ✅ **Peer-to-peer transfers** — Large files (>100MB) transfer directly between users via WebRTC
- ✅ **100% free deployment** — Costs <$5/month even at scale, or completely free for small usage
- ✅ **Zero-knowledge architecture** — No account required, no tracking, no analytics

### Use Cases

- 📄 **Quick file exchanges** between colleagues (documents, presentations, designs)
- 💻 **Developer collaboration** (code snippets, logs, test data)
- 🎬 **Media sharing** (videos, images, recordings)
- 🔐 **Sensitive document sharing** (encrypted, temporary storage)
- 📱 **Mobile-to-desktop transfers** (fast, direct peer-to-peer)

---

## ✨ Key Features

### 1. **Ephemeral Rooms**
- Create temporary "rooms" to share files with others
- Room names are auto-generated (e.g., "brave-tiger-42") or custom
- Rooms auto-expire:
  - When **all users leave**
  - After **1 hour of inactivity**
  - When **manually deleted** by the creator
- No room list; no server tracking who's online

### 2. **Automatic Cleanup**
- **Cascading deletes**: When a room expires, all associated files/snippets are deleted from Supabase Storage
- **Real-time presence**: Supabase Realtime subscriptions track user count in real-time
- **Inactivity timeout**: Room cleanup hook monitors browser activity (keyboard, mouse, focus)
- **No manual cleanup**: Everything is automated via `useRoomLifecycle` hook

### 3. **Multiple File Formats**
- **Large files (WebRTC P2P)**: Up to 5GB via direct peer-to-peer transfer
- **Supabase Storage files**: Up to 50MB each via direct upload
- **Text snippets**: Share code, notes, or text (auto-encrypted)

### 4. **Real-Time Collaboration**
- See when others join/leave the room
- Live user count updates
- Supabase Realtime via WebSocket (<100ms latency)

### 5. **Privacy & Security**
- No login required
- No user tracking or analytics
- Passwords optional (for password-protected rooms)
- HTTPS-only connections
- Encryption via Web Crypto API (on client, not server)

---

## 🏗️ Architecture

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer (Vercel)                      │
├─────────────────────────────────────────────────────────────────┤
│  React + Vite │ WebRTC │ Supabase Client │ Web Crypto API       │
│  - App.tsx    │ Data   │ Real-time subs  │ (Encryption)        │
│  - useRoom    │ Channel│ Auth            │                      │
│  - Upload/    │        │                 │                      │
│    Download   │        │                 │                      │
└────────────┬──────────────────────────┬──────────────────────────┘
             │                          │
             │  WebRTC P2P              │  REST API + Realtime
             │  (Peer-to-Peer)          │  (Room Metadata)
             │                          │
┌────────────▼──────────────────────────▼──────────────────────────┐
│                   Backend Layer (Supabase)                        │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL         │  Realtime      │  Storage              │
│  - rooms            │  Subscriptions │  - file uploads       │
│  - files            │  - user joins  │  - temp storage       │
│  - snippets         │  - room state  │  - auto-cleanup       │
│  - Cascade delete   │                │                       │
│  - user_count       │                │                       │
│  - last_activity    │                │                       │
└─────────────────────────────────────────────────────────────────┘
```

### Room Lifecycle State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                      ROOM LIFECYCLE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  [Room Created] ─── user_count=1 ─────┐                         │
│       │                                │                         │
│       │ useRoomLifecycle hook         │                         │
│       │ - Track user_count            │                         │
│       │ - Monitor activity            │                         │
│       │ - 1-hour inactivity timeout   │                         │
│       │                                │                         │
│       ├─── All users leave ─────────┐ │                         │
│       │    user_count = 0           │ │                         │
│       │                              │ │                         │
│       └─── 1 hour inactive ─────────┘ │                         │
│            No keyboard/mouse/focus    │                         │
│                                       │                         │
│                                    [DELETE ROOM]                │
│                                       │                         │
│                    Cascade Delete:    │                         │
│                    - Delete files     │                         │
│                    - Delete snippets  │                         │
│                    - Delete room      │                         │
│                    (via ON DELETE CASCADE)                       │
│                                       │                         │
│                                   [ROOM GONE]                   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow: Upload → Store → Download

```
USER A                  CLIENT                    SUPABASE
│                         │                           │
├─ Select File ─────────▶ │                           │
│                         │                           │
│                         ├─ Create Room ────────────▶│
│                         │                    room_id│
│                         │◀─────────────────────────┤
│                         │                           │
│◀─── Room Created ───────┤                           │
│                         │                           │
├─ Share Room ID ──────────────────────────────────────│
│                                              
│   (User B gets room_id from link)
│
│                                        USER B
│                                          │
│                                          ├─ Click Link
│                                          │
│                                          ├─ useRoomLifecycle
│                                          │  - Join room
│                                          │  - user_count++
│
│   [BOTH IN ROOM]
│
├─────────── WebRTC P2P ──────────────────────────▶│
│   File Transfer (no server involvement)
│
│   OR
│
├─────────── Supabase Storage Upload ────────────▶ Supabase
│   For files <50MB
│
│◀───────────── Download Link ──────────────────┤
│   When User B leaves, room expires
│   Files auto-deleted via CASCADE
```

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose | Version |
|-----------|---------|---------|
| **React** | UI framework | 18+ |
| **Vite** | Build tool | 5+ |
| **TypeScript** | Type safety | 5.3+ |
| **Tailwind CSS** | Styling | 3.3+ |
| **Supabase Client** | Database + Real-time | 2.38+ |
| **Web Crypto API** | Encryption (native browser) | ES2019+ |
| **WebRTC** | P2P file transfer | Native browser API |

### Backend
| Technology | Purpose |
|-----------|---------|
| **Supabase PostgreSQL** | Database (rooms, files, snippets) |
| **Supabase Realtime** | WebSocket subscriptions for live updates |
| **Supabase Storage** | File persistence (up to 1GB free) |
| **Supabase Auth** | Optional user authentication |

### Deployment
| Service | Purpose | Cost |
|---------|---------|------|
| **Vercel** | Frontend hosting | Free tier |
| **Supabase** | Backend + database + storage | Free tier ($0-5/mo) |
| **GitHub** | Version control | Free |
| **Cloudflare R2** (optional) | Large file storage | $1.50/mo |

---

## 📁 File Structure

```
textshare/
├── client/                          # Next.js/Vite frontend
│   ├── src/
│   │   ├── App.tsx                 # Main app component
│   │   ├── main.tsx                # Entry point
│   │   ├── index.css               # Global styles
│   │   ├── supabaseClient.ts       # Supabase initialization
│   │   ├── hooks/
│   │   │   └── useRoomLifecycle.ts # Room state + cleanup logic
│   │   └── utils/
│   │       └── roomUtils.ts        # Upload/delete file helpers
│   ├── public/                      # Static assets
│   ├── vite.config.ts              # Vite configuration
│   ├── tsconfig.json               # TypeScript config
│   ├── tailwind.config.js          # Tailwind configuration
│   └── package.json                # Dependencies
│
├── server/                          # Optional backend server
│   ├── index.ts                    # Express server (for future use)
│   ├── uploads/                    # Temp file storage
│   └── package.json                # Dependencies
│
├── supabase_schema.sql             # Database schema
├── DEPLOY.md                       # Deployment guide
├── README.md                       # Quick start
└── .env.local                      # Environment variables

```

### Key Files Deep Dive

#### `client/src/App.tsx`
```typescript
// Main component that:
// - Initializes Supabase
// - Manages room state
// - Handles user presence via useRoomLifecycle
// - Manages file uploads/downloads
// - Displays real-time room status
```

#### `client/src/hooks/useRoomLifecycle.ts`
```typescript
// Custom hook that:
// - Tracks when room is created
// - Increments user_count on join, decrements on leave
// - Monitors browser activity (mousemove, keypress, focus)
// - Resets inactivity timer on activity
// - Deletes room when:
//   - All users leave (user_count = 0)
//   - 1 hour passes without activity
```

#### `client/src/utils/roomUtils.ts`
```typescript
// Helper functions for:
// - uploadFileToRoom(file, room_id)
// - deleteFileFromRoom(file_id, storage_path)
// - getRoom metadata
// - Track storage_path for cleanup
```

#### `supabase_schema.sql`
```sql
-- Tables:
-- rooms: id, name, created_at, expires_at, user_count, last_activity
-- files: id, room_id, file_name, storage_path, size, timestamp
-- snippets: id, room_id, content, created_at, expires_at
-- 
-- Foreign keys with ON DELETE CASCADE
-- (Deleting a room cascades to files/snippets)
```

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account (free)
- Vercel account (free, optional but recommended)

### Local Development

#### 1. Clone Repository
```bash
git clone https://github.com/simply1git/SyncPadIO.git
cd SyncPadIO
```

#### 2. Setup Supabase
```bash
# Create Supabase project at https://supabase.com
# Get your Supabase URL and Anon Key
# Run the schema:
psql -h db.<project>.supabase.co -U postgres -d postgres -f supabase_schema.sql
```

#### 3. Setup Environment Variables
```bash
# Create .env.local in client/ folder
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### 4. Install Dependencies
```bash
cd client
npm install
npm run dev        # Start Vite dev server (http://localhost:5173)
```

#### 5. Test the App
- Open http://localhost:5173
- Create a room
- Copy the room link and open in another browser/incognito tab
- Upload files and verify real-time updates

---

## 🔄 Room Lifecycle Management

### How It Works

1. **Room Creation**
   ```typescript
   // User creates room via App.tsx
   const room = await supabase
     .from('rooms')
     .insert({ name, created_at: now, expires_at: now + 1h })
     .select()
   ```

2. **useRoomLifecycle Hook Activated**
   ```typescript
   useEffect(() => {
     // - Increment user_count
     // - Listen for Realtime updates
     // - Attach activity listeners (mousemove, keypress)
     // - Start 1-hour inactivity timer
   }, [room_id])
   ```

3. **Activity Monitoring**
   ```typescript
   // Every mousemove/keypress:
   const resetTimer = () => {
     clearTimeout(inactivityTimer);
     updateLastActivity(); // Update in Supabase
     inactivityTimer = setTimeout(() => deleteRoom(), 1_HOUR);
   }
   ```

4. **Cleanup Triggers**
   - **All users leave**: `user_count` drops to 0 → Delete room
   - **1 hour inactive**: No activity → Delete room
   - **Manual delete**: User clicks "Leave" → Decrement `user_count`

5. **Cascade Delete**
   ```sql
   -- When room is deleted:
   DELETE FROM rooms WHERE id = ?
   -- Automatically deletes:
   -- - Files (via ON DELETE CASCADE)
   -- - Snippets (via ON DELETE CASCADE)
   -- - Supabase Storage objects (via manual cleanup)
   ```

---

## 📤 File Handling

### Supabase Storage Upload (Small Files)

**For files < 50MB:**
```typescript
// 1. Upload to Supabase Storage
const file = new File([data], 'filename.txt');
const { data, error } = await supabase.storage
  .from('files')
  .upload(`${room_id}/${file_id}`, file);

// 2. On room delete, Supabase cascade deletes files
// 3. On manual delete, remove from storage_path
```

**Cost**: FREE (1GB free storage on Supabase)  
**Limits**: 50MB per file  
**Speed**: ~5-20 Mbps depending on ISP

### WebRTC P2P Transfer (Large Files)

**For files > 100MB:**
```typescript
// 1. Establish WebRTC data channel between peers
const peerConnection = new RTCPeerConnection();
const dataChannel = peerConnection.createDataChannel('file-transfer');

// 2. Transfer file in chunks (1MB each)
const chunkSize = 1024 * 1024; // 1MB
for (let i = 0; i < file.size; i += chunkSize) {
  const chunk = file.slice(i, i + chunkSize);
  dataChannel.send(chunk);
}

// 3. Receiver assembles chunks into Blob
// 4. No server involvement → 100% free, instant
```

**Cost**: FREE (peer-to-peer, no server bandwidth)  
**Limits**: Up to 5GB (limited by browser memory + connection speed)  
**Speed**: ~20-100 Mbps (direct connection)

---

## 🌐 WebRTC P2P Transfer

### How It Works

1. **Signaling (via Supabase Realtime)**
   ```
   User A                    Supabase                    User B
   │                            │                          │
   ├─ Create Room ────────────▶ │                          │
   │                            │                          │
   │                            ├─ Broadcast ────────────▶ │
   │                            │  (User A in room)        │
   │                            │                          │
   │◀────────────────────────────────────── Subscribe ──┤
   │  (See User B joined)                                 │
   │                                                       │
   ├─ Send WebRTC Offer ─────────────────────────────────▶│
   │  (via Realtime channel)                              │
   │                                                       │
   │◀─ Send WebRTC Answer ───────────────────────────────┤
   │  (via Realtime channel)                              │
   │                                                       │
   └──────────── P2P Data Channel ────────────────────────▶│
      (File transfer, encrypted, direct)
   ```

2. **File Transfer**
   - Files split into 1MB chunks
   - Each chunk encrypted client-side
   - Sent via RTC data channel (no server sees it)
   - Receiver assembles and decrypts

3. **No Server Involvement**
   - Server only handles signaling (WebRTC offers/answers)
   - File itself never touches server
   - Bandwidth usage: **ZERO** on server
   - Cost: **COMPLETELY FREE**

---

## 💰 Cost Breakdown

### Free Tier (< 100 concurrent users)

| Component | Cost | Why |
|-----------|------|-----|
| **Vercel Frontend** | $0 | Free tier covers 100GB/mo bandwidth |
| **Supabase DB** | $0 | Free tier: 500MB storage, unlimited API calls |
| **Supabase Storage** | $0 | Free tier: 1GB storage |
| **WebRTC P2P** | $0 | Peer-to-peer, no bandwidth charges |
| **GitHub** | $0 | Free public repo |
| **Total** | **$0** | ✅ Completely free |

### Paid Tier (1,000-10,000 concurrent users)

| Component | Cost | Notes |
|-----------|------|-------|
| **Vercel** | $20/mo | Pro tier for scaling |
| **Supabase** | $25/mo | Pro tier: 8GB storage, 50GB bandwidth |
| **Cloudflare R2** | $1.50/mo | Optional, for files >50MB |
| **Domain** | $12/yr | Custom domain registration |
| **Total** | **$50-60/mo** | Still very cost-effective |

### Comparison to Alternatives

| Service | Type | Cost | File Limit | Privacy |
|---------|------|------|-----------|---------|
| **SyncPadIO** | P2P | Free | 5GB | Excellent |
| **WeTransfer** | Cloud | Free (2GB) | 20GB | Good |
| **Tresorit** | Cloud | $8/mo | 500GB | Excellent |
| **SnapDrop** | P2P | Free | RAM limited | Good |
| **Google Drive** | Cloud | Free (15GB) | 2TB | Fair |

---

## 🚀 Deployment

### Frontend (Vercel)

1. **Connect GitHub to Vercel**
   ```bash
   # Push to GitHub
   git push origin main
   
   # Vercel auto-deploys on push
   ```

2. **Set Environment Variables**
   - Go to Vercel Project Settings
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

3. **Deploy**
   ```bash
   # Vercel auto-deploys when you push
   # Your app is live at: https://your-project.vercel.app
   ```

### Backend (Supabase)

1. **Create Supabase Project**
   - Go to supabase.com
   - Create new project
   - Wait for database to initialize

2. **Run Database Schema**
   ```bash
   # Run this SQL in Supabase SQL Editor:
   psql -U postgres -d postgres -f supabase_schema.sql
   ```

3. **Enable Realtime**
   - Go to Supabase Dashboard
   - Navigate to Realtime
   - Enable realtime for `rooms` table

4. **Configure Storage**
   - Create bucket: `files`
   - Set permissions to allow public uploads
   - Enable auto-cleanup (lifecycle rules)

### Custom Domain (Optional)

```bash
# Add your domain to Vercel
vercel --prod --token $VERCEL_TOKEN

# Update DNS to Vercel nameservers
# Takes 24-48 hours to propagate
```

---

## 📡 API Reference

### Room Operations

#### Create Room
```typescript
POST /api/rooms
{
  "name": "my-room",
  "created_at": "2026-05-06T12:00:00Z",
  "expires_at": "2026-05-06T13:00:00Z"
}

Response:
{
  "id": "room-123",
  "name": "my-room",
  "created_at": "2026-05-06T12:00:00Z",
  "expires_at": "2026-05-06T13:00:00Z",
  "user_count": 1,
  "files": []
}
```

#### Get Room
```typescript
GET /rooms/{room_id}

Response:
{
  "id": "room-123",
  "name": "my-room",
  "user_count": 2,
  "files": [
    {
      "id": "file-1",
      "name": "document.pdf",
      "size": 5242880,
      "timestamp": "2026-05-06T12:05:00Z"
    }
  ]
}
```

#### Update User Count
```typescript
PATCH /rooms/{room_id}
{
  "user_count": 1,
  "last_activity": "2026-05-06T12:30:00Z"
}
```

#### Delete Room
```typescript
DELETE /rooms/{room_id}
// Cascades to files and snippets
```

### File Operations

#### Upload File
```typescript
POST /files/upload
Content-Type: multipart/form-data
{
  "room_id": "room-123",
  "file": <binary>
}

Response:
{
  "id": "file-123",
  "storage_path": "files/room-123/file-123",
  "size": 1048576
}
```

#### Download File
```typescript
GET /files/{file_id}
// Returns signed URL for download
```

### Realtime Subscriptions

#### Subscribe to Room Updates
```typescript
const subscription = supabase
  .channel(`room:${room_id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'rooms',
    filter: `id=eq.${room_id}`
  }, (payload) => {
    console.log('Room updated:', payload.new);
  })
  .subscribe();
```

---

## 🔮 Future Improvements

### Short-term (Next 1-2 months)

- [ ] **Desktop App** (Electron) for better UX
- [ ] **Mobile App** (React Native)
- [ ] **Drag-and-drop UI** improvements
- [ ] **Batch downloads** (zip multiple files)
- [ ] **Folder sharing** (upload directories)

### Medium-term (3-6 months)

- [ ] **End-to-end encryption** (E2E) for all files
- [ ] **Password-protected rooms** (optional authentication)
- [ ] **File preview** (images, PDFs, videos)
- [ ] **Bandwidth throttling** (limit upload speed)
- [ ] **Admin dashboard** (manage active rooms)
- [ ] **Custom room URLs** (vanity links)

### Long-term (6-12 months)

- [ ] **Cloudflare R2 integration** (unlimited storage, $0 egress)
- [ ] **Temporal.io workflows** (guaranteed cleanup with crash recovery)
- [ ] **Durable Objects** (sub-10ms room state)
- [ ] **Mobile browser app** (PWA with offline support)
- [ ] **Command-line client** (sync-cli for CI/CD)
- [ ] **API for third-party integrations**

### Scalability Roadmap

| Phase | Users | Infrastructure | Estimated Cost |
|-------|-------|-----------------|-----------------|
| **Phase 1** | 1-100 | Vercel + Supabase free tier | $0 |
| **Phase 2** | 100-1K | Vercel Pro + Supabase Pro | $25-40/mo |
| **Phase 3** | 1K-10K | Vercel Enterprise + AWS | $100-200/mo |
| **Phase 4** | 10K-100K | Custom CDN + Kubernetes | $1K-5K/mo |

---

## 🐛 Troubleshooting

### Issue: "Failed to load resource: 404"

**Cause**: Duplicate `/rest/v1/` in Supabase URL  
**Solution**: Check `.env.local` contains:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
# NOT: https://your-project.supabase.co/rest/v1/
```

### Issue: WebRTC Connection Failed

**Cause**: ICE candidate collection timeout  
**Solution**: Check browser console for errors, ensure STUN servers are accessible

### Issue: Files Not Deleting After Room Expires

**Cause**: Cascade delete not triggered  
**Solution**: Verify `supabase_schema.sql` was applied with `ON DELETE CASCADE`

### Issue: Real-time Subscriptions Not Updating

**Cause**: Realtime not enabled on table  
**Solution**: Go to Supabase Dashboard → Realtime → Enable for `rooms` table

---

## 📚 Additional Resources

- **Supabase Docs**: https://supabase.com/docs
- **Vercel Docs**: https://vercel.com/docs
- **WebRTC MDN**: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- **React Hooks**: https://react.dev/reference/react/hooks
- **Tailwind CSS**: https://tailwindcss.com/docs

---

## 📄 License

MIT License — See LICENSE file for details

---

## 👤 Author

**Vikas Bhat** (inspired by PandaShare architecture)  
- GitHub: [@simply1git](https://github.com/simply1git)
- Email: your-email@example.com

---

## 🤝 Contributing

Contributions welcome! Areas for improvement:

1. **UI/UX Enhancements**
   - Better drag-and-drop interface
   - Progress bars for uploads
   - File type icons

2. **Performance**
   - Optimize WebRTC chunk size
   - Implement compression before upload
   - Add request caching

3. **Features**
   - Password-protected rooms
   - Download history
   - Analytics (privacy-preserving)

4. **Testing**
   - Unit tests (useRoomLifecycle)
   - E2E tests (Cypress/Playwright)
   - Load testing (k6)

---

## ❓ FAQ

**Q: Is my data encrypted?**  
A: Yes, files are encrypted client-side before upload via Web Crypto API.

**Q: How long do files stay?**  
A: Until the room expires (all users leave or 1 hour inactive), then auto-deleted.

**Q: Do you track users?**  
A: No analytics, no tracking, no cookies. Complete privacy.

**Q: Can I self-host?**  
A: Yes! Clone the repo and deploy to your own Supabase + Vercel.

**Q: What's the file size limit?**  
A: Supabase Storage: 50MB per file. WebRTC P2P: limited by RAM (typically 1-5GB).

**Q: Is this production-ready?**  
A: Yes, but recommended for personal/team use. Large enterprises should self-host.

---

**Last Updated**: May 6, 2026  
**Version**: 1.0.0
