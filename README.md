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

## 🌟 Tonight's Features (Distress Watch & Face Gestures)

### 1. Comfort Watch (Continuous Facial Discomfort Monitor)
- **Safe Clinical Wording**: Strictly uses *"May need a check"*, *"Signal strength"*, *"Looks uncomfortable"* — never diagnostic claims.
- **52 Facial Blendshapes**: Uses offline MediaPipe FaceLandmarker with eyebrow knit, squint, nose wrinkle, sustained eye closure, and mouth stretch groupings.
- **Filters & Guards**: Smile guard eliminates false squints caused by smiling/laughter; Yawn guard suppresses jawOpen > 0.6.
- **10-Second Baseline Calibration**: Adapts to each patient's calm resting face before monitoring.
- **Cross-Check Rule**: When Pain gesture is detected while facial discomfort is elevated ($\ge 0.45$), priority escalates to Urgent with `"Face signal agrees"`.

### 2. Face Movements as Gestures (Feature B)
- Designed for individuals who cannot move their hands.
- In `/teach` (Step 3), choose **`😊 Face move`** to teach facial gestures (eyebrows raised, open mouth, winks).
- High-visibility facial contour skeleton is rendered on canvas.

### 3. Concurrent 2-Hand Gesture Recognition
- Tracks up to 2 hands concurrently (`numHands: 2`).
- Patients can gesture with either hand or both hands without switching modes.
- Distinct skeleton colors (Teal & Rose/Indigo).

### 4. Low-Light Night Mode
- `🌙 Night Light` toggle provides software exposure boost (`brightness(1.4) contrast(1.3)`) and glowing ambient screen border to illuminate the user's face and hands in dark hospital rooms.

### 5. Phone Alert Separation
- Laptop caregiver dashboard includes **"Alerts on Phone Only 🔕"** toggle to silence laptop chimes and route vibrations/audio exclusively to the caregiver's phone.

---

## 📱 Phone Setup & Troubleshooting

1. **Best Method (100% Reliable)**: Turn on your phone's **Mobile Hotspot** and connect your laptop to it. This completely avoids hospital/campus Wi-Fi client isolation.
2. **Run Connection Doctor**:
   ```bash
   npm run doctor
   ```
   Prints all active LAN IPs, confirms port status, and renders a terminal QR code.
3. Open `http://<laptop-ip>:5173/caregiver` on your phone browser or scan the QR code on `/live`.
4. Tap **"Tap to enable alerts"** on your phone to unlock browser audio and vibration permissions.

---

## 🔮 Future Work & Note on Thermal Cameras

> **Thermal-ready by design**: REACH treats every sensor as a plug-in `Signal` (hand, face, pulse; thermal later).

**Software-Only Guarantee**: REACH uses **NO hardware of any kind** — no ESP32, no beacon, no Web Serial, no thermal camera. Only the laptop webcam and the phone are used.

**Clinical Reality of Thermal Imaging**:
A standard webcam cannot measure temperature. Thermal cameras read skin surface temperature, not core temperature, and the US FDA states they should only be used one person at a time and confirmed with another method. Research on facial temperature and pain/stress is promising but inconsistent (some studies find temperature rises, others find it falls), and systematic reviews show it does not replace standard clinical pain assessment. Any future thermal integration would require specialized medical thermal hardware, rigorous calibration, and an IRB-approved clinical study.

---

## 🧪 Unit Tests

Run the engine unit test suite:
```bash
npm test
```
- **13/13 unit tests passing**:
  - `distress.test.ts` (6 tests: blendshape groupings, baseline scoring, smile guard, yawn guard, quality gates, feedback loop)
  - `engine.test.ts` (7 tests: landmark normalization, 73D features, k-NN rest rejection, state machine candidate/hold, coach similarity, 2-hand cross-mirroring, face gestures as Feature B)

---

## ⚖️ Honest Limitations & Medical Disclaimer

Facial signals can look like other feelings (for example disgust, sadness, fear or anger), and studies show face-analysis tools can work worse on some skin tones and on faces with tubes, tape, bandages or facial weakness. Acted expressions are not real pain. So REACH only asks a person to check, it never says what the person feels. It is an assistive prototype, not a medical diagnosis device. A human caregiver or nurse always makes the final assessment.
