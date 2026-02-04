# Deployment Guide for SyncPadIO

This guide covers how to deploy the SyncPadIO application for free using **Render** (Backend) and **Vercel** (Frontend).

## Prerequisites

- A [GitHub](https://github.com/) account.
- Push this code to a new GitHub repository.

---

## Part 1: Deploy Backend (Server) to Render

Render is excellent for Node.js applications with WebSocket support.

1.  **Sign up/Login** to [Render](https://render.com/).
2.  Click **"New + "** -> **"Web Service"**.
3.  Connect your GitHub repository.
4.  Configure the service:
    *   **Name**: `textshare-server` (or similar)
    *   **Region**: Choose one close to you.
    *   **Branch**: `main` (or master)
    *   **Root Directory**: `server` (Important!)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install && npm run build`
    *   **Start Command**: `npm start`
    *   **Plan**: Free
5.  Click **"Create Web Service"**.
6.  Wait for the deployment to finish.
7.  **Copy the Service URL** (e.g., `https://textshare-server.onrender.com`). You will need this for the frontend.

> **Note:** On the free tier, the server will "spin down" after inactivity. The first request might take 50 seconds to wake it up.

---

## Part 2: Deploy Frontend (Client) to Vercel

Vercel is the standard for hosting React/Vite applications.

1.  **Sign up/Login** to [Vercel](https://vercel.com/).
2.  Click **"Add New..."** -> **"Project"**.
3.  Import your GitHub repository.
4.  Configure the project:
    *   **Root Directory**: Click "Edit" and select `client`.
    *   **Framework Preset**: It should auto-detect `Vite`.
    *   **Environment Variables**:
        *   Key: `VITE_SERVER_URL`
        *   Value: Paste your Render URL (e.g., `https://textshare-server.onrender.com`)
        *   *Note: Remove any trailing slash from the URL.*
5.  Click **"Deploy"**.
6.  Wait for the build to complete.
7.  Visit your new live URL!

---

## Troubleshooting

-   **Socket Connection Fail**: Open the browser console (F12) -> Console. If you see connection errors, check that `VITE_SERVER_URL` in Vercel is correct (https, no trailing slash).
-   **Files Disappearing**: On the free tier of Render, uploaded files are stored on a temporary disk that gets wiped when the server restarts. For permanent storage, you would need to integrate AWS S3 or a similar service.
