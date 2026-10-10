# REACH - Camera-Based Gesture Communication Tool

> **"REACH learns the movement the person can make, instead of asking the person to learn the movement the system expects."**

REACH is a camera-based communication tool designed for people who cannot speak or press a normal call button (ALS, stroke, spinal cord injury, intubated patients). It turns whatever micro hand shape or wrist movement a person can comfortably make into requests for a caregiver (Water, Pain, Bathroom, Move me, Emergency).

---

## 📱 Pages & Links

| Page | URL | Purpose |
|---|---|---|
| **Teach** | `http://localhost:5173/teach` | Teach custom movements (takes <20s per gesture). Auto-saves profile. |
| **Patient Live** | `http://localhost:5173/live` | Live webcam camera feed with skeleton overlay, hold ring & request chips. |
| **Caregiver Station** | `http://<laptop-ip>:5173/caregiver` or `http://localhost:5173/caregiver` | Real-time request dashboard, sound alerts, vibration & Acknowledge buttons. |
| **Caregiver Mobile** | Scan QR code on `/live` or open `http://<laptop-ip>:5173/caregiver` | Mobile web view for caregivers on phones. |
| **Judge Results** | `http://localhost:5173/results` | Benchmark performance metrics, FPS speed, accuracy matrix & 60s false alarm test. |
| **Settings** | `http://localhost:5173/settings` | Sliders for hold time, recognition strictness, dark mode, and speech alerts. |

---

## 🚀 One-Command Start

```bash
# 1. Install dependencies and download local MediaPipe assets
npm install

# 2. Start dev server (Frontend Vite + Backend Express & WebSocket)
npm run dev
```

---

## 🔒 100% Offline & Private

- **No Video Saved or Uploaded**: No video frames ever leave the browser. All MediaPipe hand landmark tracking runs 100% locally on-device.
- **Offline Wi-Fi Network**: Bundles `@mediapipe/tasks-vision` WASM binaries and the `hand_landmarker.task` model file locally in `public/mediapipe/`. Works completely without internet access.

---

## 🏗️ Architecture Overview

```
 ┌──────────────────────────────────────────────────────────┐
 │                  REACH Client (Browser)                  │
 │                                                          │
 │  [Webcam Stream] ──► [MediaPipe HandLandmarker (Local)]  │
 │                              │ 21 (x,y,z) Landmarks      │
 │                              ▼                           │
 │                      [Normalize Engine]                  │
 │                              │ 73 Pose Features          │
 │                              ▼                           │
 │                    [k-NN (k=3) Classifier]               │
 │                              │ Confidence & Margin       │
 │                              ▼                           │
 │                  [Decision State Machine]                │
 │                              │ Hold Ring (1200ms)        │
 └──────────────────────────────┬───────────────────────────┘
                                │ JSON WebSocket (/ws)
                                ▼
 ┌──────────────────────────────────────────────────────────┐
 │                REACH Server (Node / Express)             │
 │                                                          │
 │     • JSON WebSocket Server (Port 3000)                   │
 │     • Profile & Requests JSON Storage (data/*.json)      │
 └──────────────────────────────┬───────────────────────────┘
                                │ Broadcast Request
                                ▼
 ┌──────────────────────────────────────────────────────────┐
 │               Caregiver Station (/caregiver)             │
 │  • Real-Time List  • Web Audio Chime  • Speech Alert     │
 │  • Phone Vibration • 30s Escalation  • CSV Export        │
 └──────────────────────────────┴───────────────────────────┘
```

---

## 🎯 How to Demo for Judges (2-Minute Demo Flow)

1. **Teach Flow (`/teach`)**:
   - Open `/teach`. Enter patient name ("Ravi", "Bed 4").
   - Select 3 requests (Water, Pain, Emergency).
   - Hold your chosen hand shapes for 3 rounds (~15 seconds total).
   - Record 5 seconds of relaxed rest hand movement to demonstrate false-alarm rejection.
   - Inspect the **Gesture Coach Analysis** (similarity warnings, comfort scores, and 2D Movement Map).

2. **Live Request Flow (`/live`)**:
   - Open `/live` on laptop.
   - Scan the QR Code with a phone (or open `/caregiver` in a separate tab).
   - Hold your gesture in front of the camera: watch the glowing teal skeleton lines and hold ring fill up.
   - Tap **ACKNOWLEDGE** on the caregiver screen: watch the live patient screen turn green with *"Help is coming"* and hear the text-to-speech announcement.

3. **Benchmark Results (`/results`)**:
   - Open `/results` to view live FPS metrics, latency (<0.8s), confusion matrices, and run the 60-second false-alarm verification test.

---

## 🧪 Unit Tests

Run the engine unit test suite:
```bash
npm test
```
- Tests landmark normalization, 73D pose feature extraction, $k$-NN classification with rest hand rejection, decision state machine, and Gesture Coach warnings.

---

## ⚖️ Limitations & Disclaimer

REACH is a hackathon prototype developed for demonstration purposes. It is not a clinically certified medical device. Real clinical deployment requires formal clinical trials, user testing with motor-impaired individuals, regulatory compliance, and safety review.
