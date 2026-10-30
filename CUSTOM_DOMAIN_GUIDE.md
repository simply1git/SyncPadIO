# SyncPadIO — Production Custom Domain Setup & Hardening Guide

This handbook details the end-to-end instructions for attaching and configuring a custom domain (such as `syncpad.io` or `sync.yourbrand.com`) to your SyncPadIO deployment on Vercel and Supabase.

---

## 1. Vercel Custom Domain Configuration

### Option A: Using the Vercel Dashboard (Recommended)
1. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and open the **SyncPadIO** project.
2. Navigate to **Settings** → **Domains**.
3. In the input field, enter your desired domain (e.g., `syncpad.io` or `sync.yourdomain.com`) and click **Add**.
4. Select your preferred redirection behavior:
   - **Apex Domain:** `syncpad.io` (Recommended with redirect from `www.syncpad.io`).
   - **Subdomain:** `sync.yourdomain.com` (Direct routing).

### Option B: Using the Vercel CLI
If you have the Vercel CLI installed:
```bash
# Add custom domain directly to the production project
vercel domains add syncpad.io

# Verify DNS configuration status
vercel domains inspect syncpad.io
```

---

## 2. DNS Record Setup at Your Domain Registrar

Log in to your DNS provider (Cloudflare, Namecheap, GoDaddy, Route 53, Porkbun, etc.) and add the following records:

### 1. For Apex Domain (`yourdomain.com`):
| Type | Name / Host | Target / Value | TTL | Note |
|:---:|:---:|:---:|:---:|:---|
| **A** | `@` | `76.76.21.21` | Auto (or 300) | Points to Vercel global edge network |
| **CNAME** | `www` | `cname.vercel-dns.com` | Auto (or 300) | Handles www subdomain redirect |

### 2. For Subdomain (`sync.yourdomain.com`):
| Type | Name / Host | Target / Value | TTL | Note |
|:---:|:---:|:---:|:---:|:---|
| **CNAME** | `sync` | `cname.vercel-dns.com` | Auto (or 300) | Direct CNAME delegation |

---

## 3. Cloudflare Specific Instructions (If Using Cloudflare DNS)

If your domain uses Cloudflare nameservers:
1. In Cloudflare DNS management, add the **CNAME** or **A** record as shown above.
2. **Proxy Status:**
   - **DNS-Only (Grey Cloud):** Recommended during initial SSL provisioning by Vercel.
   - **Proxied (Orange Cloud):** Can be enabled after Vercel issues the certificate. Ensure:
     - SSL/TLS encryption mode is set to **Full** or **Full (Strict)**.
     - **WebSockets** is toggled **ON** in Cloudflare Network settings (required for Supabase Realtime).
     - **Rocket Loader** is set to **OFF** for `/room/*` to prevent interfering with WebRTC and Web Crypto workers.

---

## 4. Supabase CORS & Site URL Configuration

Because SyncPadIO uses Supabase for Realtime broadcast, PostgreSQL database sync, and encrypted storage, you must authorize your custom domain in Supabase:

1. Open your [Supabase Dashboard](https://supabase.com/dashboard/project/fxjmaajktqehnaergnky).
2. Go to **Authentication** → **URL Configuration**.
3. Update the following fields:
   - **Site URL:** `https://yourdomain.com`
   - **Redirect URLs:** Add:
     - `https://yourdomain.com/**`
     - `https://www.yourdomain.com/**`
     - `https://sync-pad-io.vercel.app/**` (keep fallback active)
4. Go to **Storage** → Configuration:
   - Verify CORS allows origin `https://yourdomain.com` or `*`.

---

## 5. Security & CSP Hardening Verification

SyncPadIO ships with production-hardened headers pre-configured in `vercel.json`:
- **Content-Security-Policy (CSP):**
  - Allows Supabase WSS (`wss://*.supabase.co`) for Realtime presence and WebRTC signaling.
  - Zero-server WebRTC P2P direct streaming (STUN candidate negotiation handled natively by browser RTCPeerConnection).
  - Restricts frame embedding (`X-Frame-Options: DENY`).
  - Strict referrer policy (`Referrer-Policy: strict-origin-when-cross-origin`).
  - Restricts hardware permissions (`Permissions-Policy: camera=(), microphone=(), geolocation=()`).

Test your domain security grade at [SecurityHeaders.com](https://securityheaders.com).

---

## 6. Verification Checklist

- [ ] Vercel displays green **Valid Configuration** checkmark next to your domain.
- [ ] Automatic Let's Encrypt SSL certificate is provisioned (typically takes 1–5 minutes).
- [ ] Opening `https://yourdomain.com` loads the SyncPadIO PWA with HTTP 200.
- [ ] Joining a room on the custom domain synchronizes in Realtime with peers on mobile and desktop.
- [ ] P2P WebRTC Direct Transfer connects seamlessly without ICE candidate drops.
- [ ] Biometric Passkeys (Touch ID / Face ID) bind to `https://yourdomain.com` domain origin cleanly.

