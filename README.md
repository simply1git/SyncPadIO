# SyncPadIO ⚡

> **Ephemeral, Zero-Knowledge Real-Time Code & File Sharing Platform**

[![CI](https://github.com/simply1git/SyncPadIO/actions/workflows/ci.yml/badge.svg)](https://github.com/simply1git/SyncPadIO/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?logo=vercel)](https://sync-pad-io.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

SyncPadIO is an ephemeral collaboration workspace built for developers and teams. Share code snippets, notes, documents, and media seamlessly across devices and browsers with zero friction, instant real-time synchronization, and client-side zero-knowledge encryption.

---

## ✨ Features

- 🔐 **Zero-Knowledge End-to-End Encryption (E2EE):**
  - Text and snippets encrypted with AES-256-GCM using the native Web Crypto API.
  - Encryption keys reside exclusively in the client's URL hash fragment (`#k=...`), ensuring servers and databases never see plaintext keys.
- ⚡ **Real-Time Cross-Device Synchronization:**
  - Powered by Supabase Realtime WebSocket engine with sub-100ms sync latency.
  - Multi-peer presence tracking with automatic desertion detection.
- 🎨 **Developer-First Code Highlighting:**
  - Intelligent auto-detection for 50+ programming languages.
  - Prism syntax highlighting with dark theme and optional Markdown live rendering.
- 📁 **Streamlined File Sharing & Batch Downloads:**
  - Up to 50MB per file with real-time XHR upload progress and abort support.
  - Multi-file selection with one-click Zip archive packaging (`JSZip`) and sequential downloads.
  - In-browser safe preview for images, video, and sandboxed PDF documents.
- ⏱️ **Configurable Ephemeral Lifecycle:**
  - By default, sessions auto-purge on inactivity (1h) or when all users leave/close.
  - Room creators can optionally enable 24-hour retention to preserve rooms across desertion.
  - Automatic 4-hour GitHub Actions keep-alive pings keep Supabase and Vercel active 24/7/365.
  - Cascading deletes ensure files and snippets in Supabase Storage are purged when expired.
- 📱 **Progressive Web App (PWA):**
  - Fully offline-cached shell with Workbox service worker and responsive mobile layout.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Client Layer (Vercel)                     │
│  React 18 · Vite · Tailwind · Web Crypto API · Vitest       │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
       Realtime WebSocket                 REST / Storage
       (Presence & Changes)               (Encrypted Snippets & Files)
               │                               │
               ▼                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Supabase Cloud Infrastructure               │
│  PostgreSQL (Row-Level Security) · Bucket Storage           │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or pnpm

### 1. Clone & Install
```bash
git clone https://github.com/simply1git/SyncPadIO.git
cd SyncPadIO

# Install client dependencies
cd client
npm install
```

### 2. Environment Configuration
Create `client/.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Run Development Server
```bash
npm run dev
```
Visit `http://localhost:5173`.

### 4. Run Tests & Linter
```bash
# Run unit test suite
npm run test

# Run ESLint static check
npm run lint

# Build production bundle
npm run build
```

---

## 🗄️ Database Setup (Supabase)

SyncPadIO runs on Supabase PostgreSQL. Execute [supabase_schema.sql](supabase_schema.sql) in your Supabase SQL Editor.
The schema automatically configures:
- Row-Level Security (RLS) on `rooms`, `snippets`, and `files`.
- Realtime publication for low-latency broadcasts.
- Storage bucket `uploads` with scoped security policies and constraints.

---

## 🛡️ Security Model

1. **Client-Side Key Generation:**
   Rooms generate a 256-bit cryptographic AES key on the client (`crypto.getRandomValues`).
2. **URL Hash Isolation:**
   The key is stored in the browser's URL hash (`/#k=...`). According to RFC 3986, hash fragments are strictly client-side and never sent in HTTP request headers to hosting providers or APIs.
3. **Database RLS Policies:**
   Supabase PostgreSQL enforces Row-Level Security with size constraints (max 500KB text, max 50MB files).
4. **Sandboxed Media Previews:**
   PDF and embedded previews run inside restricted `<iframe sandbox="allow-scripts allow-same-origin">` to mitigate XSS vectors.

---

## 📄 License

MIT © simply1git
