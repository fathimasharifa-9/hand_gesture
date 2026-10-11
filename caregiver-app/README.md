# REACH Caregiver Mobile App (Expo)

Native mobile caregiver station for phones, with vibration haptics, voice alerts, screen keep-awake, and live request triage.

---

## 🚀 Running on Your Phone

1. Make sure your phone and laptop are on the same Wi-Fi network (or connect your laptop to your phone's personal hotspot).
2. Install dependencies (first time only):
   ```bash
   cd caregiver-app
   npm install
   ```
3. Start Expo:
   ```bash
   npm start
   ```
4. Open the **Expo Go** app on your phone:
   - **Android**: Scan the QR code shown in your terminal.
   - **iOS**: Scan the QR code using the iPhone Camera app.

---

## 🩺 Built-In Connection Doctor

If the app cannot connect to the laptop:
1. Tap the **Doctor 🩺** tab in the app.
2. Enter your laptop's Wi-Fi IP address (run `npm run doctor` on your laptop to see it).
3. Tap **Test Reachability** to verify latency.
4. Tap **Send Test Call** to prove that phone alerts arrive instantly.

---

## 🌐 No App Needed Alternative (Web Browser)

Caregivers can also simply open the laptop URL in any mobile browser (Safari, Chrome) without installing Expo:
```
http://<laptop-ip>:5173/caregiver
```
or scan the QR code displayed on the patient live screen (`/live`).
