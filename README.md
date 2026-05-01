# TextShare - Real-time Text Sharing

A secure, offline-capable text sharing platform for your local network.

> 🎉 **Now with the Ultimate Version!** See [ULTIMATE_VERSION.md](ULTIMATE_VERSION.md) for production-grade improvements: modular architecture, custom hooks, enhanced security, complete documentation, and more.

## 📚 Documentation

- **[ULTIMATE_VERSION.md](ULTIMATE_VERSION.md)** - Complete improvement guide with migration steps
- **[API_REFERENCE.md](API_REFERENCE.md)** - Full API documentation with code examples
- **[IMPROVEMENTS_SUMMARY.md](IMPROVEMENTS_SUMMARY.md)** - Quick overview of what's new

## 🚀 How to Run

1.  **Start the Backend:**
    ```bash
    cd server
    npm run dev
    ```
    (Runs on port 3001)

2.  **Start the Frontend:**
    ```bash
    cd client
    npm run dev
    ```
    (Runs on port 5173)

## 📱 How to Test

### Method 1: Local Simulation (Laptop Only)
1.  Open [http://localhost:5173](http://localhost:5173) in your browser.
2.  Click **Start New Session**.
3.  Open a **New Incognito Window**.
4.  Go to [http://localhost:5173](http://localhost:5173).
5.  Enter the 6-digit **Room Code** from the first window.
6.  Type text and watch it sync!

### Method 2: Mobile to Laptop (Real World)
**Prerequisite:** Phone and Laptop must be on the **same Wi-Fi**.

1.  On Laptop: Open [http://localhost:5173](http://localhost:5173) and create a room.
2.  On Phone: 
    *   **Scan the QR Code** displayed on the laptop.
    *   OR manually visit: `http://192.168.1.10:5173`
3.  Enter the Room Code.
4.  Share text instantly!

## 🔧 Troubleshooting
*   **Can't connect from phone?** 
    *   Check if your firewall is blocking Node.js.
    *   Ensure both devices are on the same Wi-Fi network.
    *   Verify your Laptop's IP address (`ipconfig` in terminal) matches the URL.
