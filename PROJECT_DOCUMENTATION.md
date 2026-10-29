# SyncPadIO - Ephemeral Code & File Sharing Platform

**Live Demo:** [sync-pad-io.vercel.app](https://sync-pad-io.vercel.app)  
**GitHub:** [simply1git/SyncPadIO](https://github.com/simply1git/SyncPadIO)

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Architecture](#architecture)
4. [Security & Zero-Knowledge Cryptography](#security--zero-knowledge-cryptography)
5. [Room Lifecycle & Cleanup](#room-lifecycle--cleanup)
6. [File Handling & Storage](#file-handling--storage)
7. [Developer Tooling & Testing](#developer-tooling--testing)
8. [Database Schema & RLS](#database-schema--rls)
9. [Deployment](#deployment)

---

## 🎯 Project Overview

**SyncPadIO** is a modern, ephemeral collaboration and sharing platform prioritizing privacy, simplicity, and zero friction.

- ✅ **Ephemeral Sessions**: Sessions exist only during active collaboration; automatically purged after 1 hour of inactivity or when deserted.
- ✅ **Zero-Knowledge E2EE**: Snippets are encrypted client-side using AES-256-GCM. The encryption key resides in the URL hash (`#k=...`) and is never sent to the server or database.
- ✅ **Real-Time Presence Tracking**: See live peer counts and synchronized updates with sub-100ms latency via Supabase Realtime WebSockets.
- ✅ **Syntax Highlighting & Markdown**: Real-time code detection for 50+ programming languages with Prism highlighting and live Markdown rendering.
- ✅ **Batch File Downloads**: Download all shared files at once as a compressed `.zip` archive or sequentially with live progress.
- ✅ **Zero Account Requirements**: No signups, no logins, no persistent tracking, no cookies.

---

## ✨ Key Features

### 1. Ephemeral Sessions
- Join or create rooms instantly using 6-character room codes or custom names.
- Sessions auto-expire:
  - After **10 minutes** if all users leave (presence desertion).
  - After **1 hour** of user inactivity.
  - When manually exited.
- When expired, cascading database foreign keys delete associated snippets and Supabase Storage objects.

### 2. High-Performance File Handling
- Up to 50MB per file with XHR streaming upload progress and per-file cancellation.
- In-browser secure media preview for images, video, and sandboxed PDF documents.
- Multi-select actions: batch download as zip (`JSZip`) or sequential direct downloads.

### 3. Developer-First Experience
- Real-time syntax highlighting (`react-syntax-highlighter` Prism) with auto-language detection.
- Markdown rendering (`react-markdown` + `remark-gfm`).
- Accessible keyboard shortcuts: `Ctrl + Enter` to send snippets, `Escape` to close modals.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer (Vercel)                    │
├─────────────────────────────────────────────────────────────────┤
│  React 18 · Vite · Tailwind · Web Crypto API · Vitest · PWA     │
│  - App.tsx (Modular Orchestrator)                               │
│  - HomeScreen, RoomHeader, SnippetFeed, FileManager             │
│  - useRoomLifecycle (Throttled DB activity & cleanup)           │
└────────────┬──────────────────────────────────────┬─────────────┘
             │                                      │
     Realtime WebSocket (Presence & Events)    REST / Storage API
             │                                      │
┌────────────▼──────────────────────────────────────▼─────────────┐
│                 Supabase Cloud Infrastructure                   │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Row-Level Security Enabled)                        │
│  - rooms, snippets, files                                       │
│  - Storage bucket: uploads (50MB constraint, sanitized paths)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security & Zero-Knowledge Cryptography

SyncPadIO implements a true zero-knowledge end-to-end encryption model:

1. **Key Generation**: When a user creates a session, `crypto.getRandomValues(new Uint8Array(32))` generates a 256-bit AES-GCM key.
2. **Hash-Fragment Storage**: The key is attached to the browser URL hash fragment:
   `https://sync-pad-io.vercel.app/?room=ABC123#k=<base64-key>`
   Per RFC 3986, the fragment identifier after `#` is strictly evaluated by the browser and **never sent in HTTP request headers**.
3. **Encryption Standard**: Plaintext is encoded using AES-256-GCM with a random 12-byte IV for every message.
4. **Per-Room Salt Derivation**: When a hash key is not present (e.g. manual room code join), the key is derived via PBKDF2 (100,000 iterations, SHA-256) with a dynamic per-room salt (`SHA-256("syncpadio-salt-v2:" + roomId)`).
5. **Safe Chunked Base64**: Buffer conversions use chunked processing to prevent call-stack overflows on large payloads.
6. **Sandboxed Previews**: PDF and external media embeds use `<iframe sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer">`.

---

## ⏱️ Room Lifecycle & Cleanup

The `useRoomLifecycle` hook manages session vitality:
- **Throttled Updates**: Activity writes to PostgreSQL are strictly throttled to at most once per 60 seconds (`ACTIVITY_THROTTLE_MS = 60_000`).
- **Interaction Filtering**: Evaluates real user interactions (`keydown`, `click`, `touchstart`) and explicitly filters out high-frequency `mousemove` events.
- **Grace-Period Desertion**: When presence drops to 0 peers, a 10-minute cleanup timer begins. If peers reconnect before the timeout, the cleanup cancels automatically.

---

## 🧪 Developer Tooling & Testing

SyncPadIO includes automated testing and static analysis:

```bash
# Run Vitest test suite
npm --prefix client run test

# Run ESLint validation
npm --prefix client run lint

# Build production bundle with PWA precache
npm --prefix client run build
```

The test suite covers:
- Chunked Base64 encoding/decoding and call-stack limits.
- High-entropy cryptographic room key generation.
- AES-256-GCM encryption/decryption roundtrips and tamper detection.
- Zero-knowledge URL hash parsing and sharing.
- Room code extraction from complex URLs.
- File size calculation and dangerous executable extension filtering.
- Code language heuristics for syntax highlighting.

---

## 🗄️ Database Schema & RLS

Execute [supabase_schema.sql](supabase_schema.sql) in your Supabase SQL editor:
- **Row-Level Security (RLS)** enabled across `rooms`, `snippets`, and `files`.
- Automatic cascading deletes when a room record is removed.
- Database-level validation constraints (max 500KB text snippets, max 50MB file sizes).
- Scoped storage policies on the `uploads` bucket.
