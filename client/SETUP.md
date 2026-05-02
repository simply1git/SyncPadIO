# SyncPadIO Client Setup Guide

## Prerequisites

1. **Supabase Project** - Create one at [supabase.com](https://supabase.com)
2. **Node.js** 16+ and npm

## Installation

```bash
cd client
npm install
```

## Environment Variables

Create a `.env.local` file in the `client/` directory (do NOT commit this file):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_SERVER_URL=http://localhost:3001  # or your backend URL
```

### Getting Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings** → **API**
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Anon/Public Key** → `VITE_SUPABASE_ANON_KEY`

## Local Development

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Production Build

```bash
npm run build
npm run preview
```

## Vercel Deployment

1. Deploy to Vercel
2. In Vercel Project Settings → Environment Variables, add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

The build will automatically use these during deployment.

## Troubleshooting

### "Missing Supabase credentials" Error

Check the browser console (F12 → Console tab). You should see which credentials are missing:
- ❌ `VITE_SUPABASE_URL` - Missing
- ❌ `VITE_SUPABASE_ANON_KEY` - Missing

**Fix**: Ensure `.env.local` is created and has correct values.

### Local connection issues

If you're on the same network but can't connect:
1. Check that both devices are on the same Wi-Fi
2. Make sure firewall isn't blocking local connections
3. Try accessing via device IP: `http://192.168.x.x:5173`
