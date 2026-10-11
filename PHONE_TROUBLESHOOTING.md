# REACH - Phone & Caregiver Connection Guide

> Simple, Grade-5 English guide to connecting your phone to the REACH Caregiver Station.

---

## ⚡ The Fastest Way to Connect (The Phone Hotspot Method)

If you are on school, university, hospital, or public Wi-Fi, the router often blocks phones and laptops from talking to each other (called **Client Isolation**).

### Do this first — It works every time:
1. Turn on your **Personal Hotspot** on your phone.
2. Connect your laptop's Wi-Fi to your phone's hotspot.
3. On your laptop, open a terminal and run:
   ```bash
   npm run doctor
   ```
4. Scan the QR code with your phone camera!

---

## 🛠️ Top 6 Problems & Easy Fixes

### 1. "This site can't be reached" or connection timed out
* **Why it happens**: Your phone and laptop are on different networks, or your Wi-Fi router blocks device-to-device connections.
* **How to fix**: Use the **Phone Hotspot Method** above, or make sure both devices are connected to the exact same home Wi-Fi name.

---

### 2. Windows Firewall blocked the connection
* **Why it happens**: Windows Defender Firewall blocked Node.js from accepting incoming calls from your phone.
* **How to fix**:
  1. Press the **Windows Key** on your laptop, search for **Allow an app through Windows Firewall**, and open it.
  2. Click the button that says **Change settings** (top right).
  3. Scroll down the list until you find **Node.js: Server-side JavaScript** (or `node.exe`).
  4. Make sure **BOTH Private and Public checkboxes are CHECKED**.
  5. Click **OK** at the bottom and reload your phone.

---

### 3. The QR code picked the wrong laptop address
* **Why it happens**: If you use Docker, WSL, VirtualBox, or a VPN on your laptop, those create "virtual" addresses that your phone cannot see.
* **How to fix**:
  1. On the caregiver page, tap the **Connection Doctor** tab.
  2. Look at the list under **Detected Laptop IP Candidates**.
  3. Tap the address labeled **Wi-Fi** (starts with `192.168.` or `10.`).
  4. Tap **Save & Reconnect**.

---

### 4. The phone went to sleep and alerts stopped
* **Why it happens**: When phone screens turn off, mobile browsers put internet connections to sleep to save battery.
* **How to fix**:
  1. REACH automatically reconnects the moment you wake your phone up.
  2. To stop the phone from sleeping while you are on duty, tap the **"Keep Screen Awake"** button in the caregiver header.

---

### 5. No sound chime or vibration on the phone
* **Why it happens**: Mobile phones block sound and buzzing until you physically tap the screen once (browser privacy rule).
* **How to fix**:
  1. Tap the big banner at the top: **"Tap to Enable Sound & Vibration"**.
  2. Turn your phone's physical silent switch OFF (or turn volume up).
  3. *iPhone Note*: Apple Safari does not allow websites to vibrate the phone. On iPhones, REACH uses loud sound chimes and flashes the screen edge red instead.

---

### 6. The page loads, but shows "Offline ⚠️"
* **Why it happens**: The web page loaded, but the real-time WebSocket connection to port 3000 was interrupted.
* **How to fix**:
  1. Tap the **Connection Doctor** tab on your phone.
  2. Tap **Test HTTP Reachability** to check if the laptop is responding.
  3. Check your laptop terminal to confirm `npm run dev` is still active.
  4. Tap **Send a Test Help Request** to verify the path end-to-end.

---

## 🩺 Diagnostic Tool

Whenever you want to check your network or see your QR code in the terminal, run:
```bash
npm run doctor
```
This prints your Wi-Fi IP, port status, and a full ASCII QR code right in your terminal.
