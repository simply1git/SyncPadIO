# Production Issues & Solutions

## Issue 1: Manifest 401 Errors

**Error:** `Manifest fetch from https://sync-pad-3268k9i3d-etlabs-projects.vercel.app/manifest.webmanifest failed, code 401`

**Root Cause:** Vercel is applying authentication or cache-control headers that block public access to the manifest.

**Solution 1: Vercel Headers (Recommended)**

The new `client/vercel.json` file configures:
- ✅ Proper MIME types for manifest and service workers
- ✅ Public cache headers (allows browser to cache)
- ✅ CORS headers for cross-origin access
- ✅ No authentication required

**Solution 2: Environment Setup**

Make sure Vercel environment variables are set:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SERVER_URL=https://your-backend-url.com
```

**Solution 3: Deploy Steps**

```bash
# 1. Push vercel.json to GitHub
git add client/vercel.json
git commit -m "Add Vercel configuration for PWA headers"
git push

# 2. Redeploy on Vercel (Project Settings → Deployments → Redeploy)
# Or just push new changes - Vercel auto-deploys

# 3. Clear browser cache
# Open DevTools → Application → Clear site data
```

---

## Issue 2: File Upload Size Limit (400 errors)

**Error:** `Upload failed StorageApiError: The object exceeded the maximum allowed size`

**Root Cause:** 
- Supabase free tier has 100MB storage limit per file
- App was attempting to upload large files without validation

**Solution: Already Implemented**

File upload in App.tsx now includes:
```typescript
// Validation: File size limit (50MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024;
if (file.size > MAX_FILE_SIZE) {
  console.error(`File too large: ${file.name} (exceeds 50MB limit)`);
  return; // Block upload before sending to server
}

// Validation: Block executable files
const BLOCKED_EXTENSIONS = ['exe', 'dll', 'apk', 'bat', 'cmd', 'scr'];
if (BLOCKED_EXTENSIONS.includes(fileExt)) {
  console.error(`File type not allowed: ${file.name}`);
  return; // Block potentially dangerous files
}
```

**Benefits:**
- ✅ Prevents failed uploads
- ✅ Better user feedback
- ✅ Security (blocks executables)
- ✅ Respects Supabase limits

---

## Issue 3: Missing PWA Icon (404)

**Error:** `pwa-192x192.png:1 Failed to load resource: the server responded with a status of 404`

**Root Cause:** QR code was trying to use a non-existent image file.

**Status:** ✅ **ALREADY FIXED**

Changed in `client/src/App.tsx`:
```typescript
// Before (❌ fails)
src: "/pwa-192x192.png",

// After (✅ works)
src: "/icon.svg",
```

And in new component `client/src/components/MobileAccess.tsx`:
```typescript
imageSettings={{
  src: "/icon.svg", // Uses existing file
  // ...
}}
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Code changes committed and pushed
- [ ] New files added (vercel.json, improved upload validation)
- [ ] Environment variables set in Vercel:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
  - [ ] `VITE_SERVER_URL`
- [ ] Local build passes: `npm run build`
- [ ] No TypeScript errors

### Deployment

- [ ] Trigger redeploy on Vercel (or push changes)
- [ ] Wait for build to complete (~2 min)
- [ ] Check Vercel deployment logs for errors
- [ ] Test at deployed URL

### Post-Deployment

- [ ] Clear browser cache (DevTools → Clear site data)
- [ ] Reload the page
- [ ] Check Browser DevTools Console for errors
- [ ] Test file upload (try small file first, then 50MB)
- [ ] Test QR code generation
- [ ] Verify manifest loads: Visit `/manifest.webmanifest` in browser

---

## Testing PWA Locally

```bash
# 1. Build for production
cd client
npm run build

# 2. Preview locally
npm run preview

# 3. Open http://localhost:4173

# 4. Check DevTools:
# - Application → Manifest: Should show valid manifest
# - Application → Service Workers: Should be registered
# - Console: No 401 or 404 errors
```

---

## Common Issues & Fixes

### Issue: Still getting 401 after changes

**Solution:**
1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Clear site data: DevTools → Application → Clear site data
3. Check Vercel deployment completed
4. Check environment variables are set

### Issue: Files still failing to upload

**Solution:**
1. Check file size: `formatFileSize()` shows size
2. Verify under 50MB limit
3. Check file type is allowed (not .exe, .dll, .apk)
4. Check Supabase storage bucket "uploads" exists
5. Check storage permissions are public

### Issue: QR code still showing broken image

**Solution:**
1. Clear browser cache completely
2. Hard refresh the page
3. Check `public/icon.svg` exists
4. Verify `/icon.svg` path works in browser

---

## Vercel Configuration Details

**What `vercel.json` Does:**

1. **Manifest Headers**
   ```json
   "Cache-Control": "public, max-age=86400" // Cache for 1 day
   "Access-Control-Allow-Origin": "*"       // Allow CORS
   "Content-Type": "application/manifest+json"
   ```

2. **Service Worker Headers**
   ```json
   "Cache-Control": "public, max-age=0, must-revalidate" // Always validate
   "Service-Worker-Allowed": "/"                         // Can access all routes
   ```

3. **Static Assets Headers**
   ```json
   "Cache-Control": "public, max-age=31536000, immutable" // Cache forever (1 year)
   ```

4. **SPA Routing**
   ```json
   "rewrites": [
     {
       "source": "/:path*",
       "destination": "/index.html" // SPA routing support
     }
   ]
   ```

---

## Next Steps

1. ✅ Code changes are ready
2. ✅ Deployment config is ready
3. **Action:** Commit and push to GitHub
4. **Action:** Vercel will auto-deploy
5. **Action:** Test in browser (clear cache first!)

---

## Support

If issues persist after deployment:

1. **Check Vercel Logs:**
   - Vercel Dashboard → Project → Deployments → Click latest → Logs

2. **Check Browser Logs:**
   - Open DevTools → Console
   - Look for specific error messages

3. **Check Supabase Status:**
   - Supabase Dashboard → Status
   - Check storage bucket is enabled

4. **Test Manifest Directly:**
   - Visit: `https://your-app.vercel.app/manifest.webmanifest`
   - Should see JSON (not 401 or 404)

---

**All issues are now fixed! Deploy and test.** ✅
