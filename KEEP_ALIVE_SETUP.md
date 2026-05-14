# Keep-Alive Service Setup Guide

## Overview

The Keep-Alive service automatically pings your Supabase database and Render backend every 5 minutes to prevent them from pausing due to inactivity. This ensures your application stays responsive 24/7.

## How It Works

### Frontend (Vercel)
- **Component**: `client/src/utils/keepAlive.ts`
- **Behavior**: Pings both Supabase and Render every 5 minutes
- **Auto-started**: When the app loads (integrated into `App.tsx`)
- **Console logs**: Shows ping success/failure in browser console

### Backend (Render)
- **Component**: `server/index.ts` (includes node-cron scheduler)
- **Behavior**: Pings Supabase every 5 minutes
- **Endpoints**:
  - `GET /health` - Returns server status
  - `GET /keep-alive` - Manually trigger a Supabase ping
  - `GET /` - Basic health check

## Deployment Steps

### Step 1: Deploy Backend to Render

1. **Push code to GitHub** (already done ✅)

2. **Create Render Web Service**:
   - Go to https://render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repo (simply1git/SyncPadIO)
   - **Build Command**: `cd server && npm run build`
   - **Start Command**: `node dist/index.js`
   - **Environment Variables**: (none needed if using free tier)
   - Click "Create Web Service"

3. **Get your Render URL**:
   - Once deployed, you'll see a URL like: `https://syncpad-io-backend.onrender.com`
   - Note this URL for the next step

### Step 2: Update Vercel Environment Variables

Add the Render backend URL to Vercel:

```bash
cd client
vercel env add VITE_RENDER_URL production
# When prompted, enter your Render URL from Step 1
# Example: https://syncpad-io-backend.onrender.com
```

### Step 3: Redeploy to Vercel

```bash
vercel deploy --prod
```

## Monitoring Keep-Alive Activity

### Frontend Console
Open your browser's Developer Tools (F12) → Console tab to see:
```
✅ Supabase pinged successfully (200)
✅ Render pinged successfully (200)
📊 Keep-alive status - Supabase: ✅, Render: ✅
```

### Backend Logs (Render Dashboard)
Your Render service will log:
```
⏰ [HH:MM:SS] Running keep-alive check...
✅ Supabase pinged successfully (status: 200)
```

## Configuration

### Change Ping Interval
Edit `client/src/utils/keepAlive.ts` line 87:
```typescript
// Change from 5 minutes (300000ms) to desired interval
}, 5 * 60 * 1000);  // ← Change this number
```

### Disable Keep-Alive (Not Recommended)
Comment out this line in `client/src/App.tsx`:
```typescript
// const cleanup = startKeepAliveService();
```

## Troubleshooting

### Pings Failing in Console?
1. Check if Supabase URL is correct in `.env.local`
2. Verify Render backend is deployed and running
3. Check browser console for CORS errors

### Render Service Keeps Pausing?
1. Ensure `VITE_RENDER_URL` is set in Vercel
2. Check Render logs for errors
3. Verify the `/health` endpoint is returning 200 status

### Supabase Still Pausing?
- Your Supabase project might be on the free tier with manual pause enabled
- Consider upgrading to Pro ($25/month) for guaranteed uptime
- Or keep the keep-alive service running (it works!)

## Free Tier Benefits

With this setup on **free tiers**:
- ✅ Supabase free (15GB database) - stays active with pings
- ✅ Render free (0.1 CPU shared) - stays warm with pings  
- ✅ Vercel free (100GB bandwidth) - no pausing
- 📊 **Total cost: $0/month** (for keep-alive!)

## Advanced: Manual Health Checks

Manually trigger a keep-alive check:

### Frontend
```javascript
import { triggerKeepAlive } from './utils/keepAlive';
await triggerKeepAlive(); // In browser console
```

### Backend
```bash
curl https://your-render-url.onrender.com/health
curl https://your-render-url.onrender.com/keep-alive
```

## Next Steps

1. ✅ Deploy backend to Render
2. ✅ Add `VITE_RENDER_URL` to Vercel
3. ✅ Redeploy frontend to Vercel
4. 📊 Monitor console logs to confirm pings working
5. 🎉 Your services will stay active forever!

---

**Questions?** Check the logs in:
- Browser Console (F12) for frontend pings
- Render Dashboard for backend pings
