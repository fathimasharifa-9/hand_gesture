# REACH - Camera-Based Assistive Gesture Communication System

> **"REACH learns the movement the person can make, instead of asking the person to learn the movement the system expects."**

REACH is a software-based assistive communication system designed for individuals who cannot reliably speak or press a standard nurse call button (ALS, stroke, spinal cord injury, post-operative intubated patients). It translates small, personalized hand shapes and wrist movements into caregiver assistance requests (Water, Pain, Bathroom, Move me, Emergency) delivered straight to the assigned caregiver's phone and dashboard over hospital Wi-Fi.

---

## 📱 Live Pages & Access Links

| Station | Localhost URL | Hospital Wi-Fi LAN URL | Purpose |
|---|---|---|---|
| **Teach REACH** | `http://localhost:5173/teach` | `http://10.132.241.116:5173/teach` | Select/register patients, manage & train personalized hand gestures (<20s per gesture). |
| **Patient Live** | `http://localhost:5173/live` | `http://10.132.241.116:5173/live` | Patient bedside camera screen with live hand skeleton, hold confirmation ring, and acknowledgement cards. |
| **Caregiver Station** | `http://localhost:5173/caregiver` | `http://10.132.241.116:5173/caregiver` | Real-time assistance request feed, multi-patient filter, Web Audio chimes, vibration, and 1-tap acknowledge. |
| **Caregiver Phone** | Scan QR code on `/live` | `http://10.132.241.116:5173/caregiver` | Mobile caregiver web view with Web Notifications and wake lock. |
| **Judge Results** | `http://localhost:5173/results` | `http://10.132.241.116:5173/results` | Benchmark performance metrics, FPS speed, accuracy matrix & 60s false alarm test. |
| **Settings** | `http://localhost:5173/settings` | `http://10.132.241.116:5173/settings` | Sliders for hold time, recognition strictness, cooldown, dark theme, and speech alerts. |

---

## 🚀 One-Command Quickstart

```bash
# 1. Install dependencies (bundles local MediaPipe HandLandmarker assets)
npm install

# 2. Start application (Frontend Vite on 5173 + Backend Express & WebSocket on 3000)
npm run dev
```

---

## ✨ Key Features & Architecture Improvements

### 1. Robust Hand-Only Gesture Recognition
- **MediaPipe Hand Landmark Tracking**: 21 3D hand coordinates tracked entirely in-browser using local WebAssembly. Zero face tracking, zero cloud dependencies.
- **Palm-Span Geometry Normalization**: Normalization anchored on wrist and multi-joint palm span (landmarks 0, 5, 9, 17), making recognition scale-invariant, distance-invariant, and immune to camera pitch/tilt foreshortening.
- **Exponential Moving Average (EMA) Temporal Smoothing**: Smooths frame-to-frame sensor noise ($\alpha = 0.65$) before feature extraction.
- **73D Geometric Feature Vector**: 63 normalized coordinates, 5 fingertip-to-wrist distances, and 5 finger bend angles.
- **k-NN Classifier & Ambiguity Margin Threshold**: Calculates Mahalanobis-bounded sample spread, requires confidence $\ge 0.60$ and separation margin $\ge 0.08$.
- **Neutral / Rest Class Rejection**: Dedicated rest state recording prevents ordinary hand movements from triggering false alerts.
- **Cooldown & State Machine**: State transitions (`NO_HAND` $\rightarrow$ `LOOKING` $\rightarrow$ `CANDIDATE` $\rightarrow$ `HOLDING` $\rightarrow$ `SENT` $\rightarrow$ `COOLDOWN`) require 3 consecutive matching frames and 1.2s hold before alert dispatch.

### 2. Multi-Patient Management
- **Full Multi-Patient Registry**: Persistent profiles stored in `data/patients.json` and synchronized with client cache.
- **Patient Attributes**: Unique identifier, patient name, bed/room number, assigned caregiver name, clinical ability notes, individual gesture mappings, and custom settings.
- **Independent Gesture Models**: Each patient has independent gesture definitions and rest vectors. Training or editing Patient A never overwrites Patient B.
- **Patient Switcher**: Easily switch between patients on Teach and Live screens; changes take effect immediately across all connected views.

### 3. Reliable Caregiver Notifications & Audio
- **Web Audio Harmonic & Emergency Alerts**:
  - **Normal Request**: 3-tone harmonic major triad chime (C5 523Hz $\rightarrow$ E5 659Hz $\rightarrow$ G5 784Hz).
  - **Urgent Emergency**: Pulsing dual-tone alert siren (880Hz / 1175Hz rapid alert bursts).
- **Audio Unlock & Test Button**: One-tap "Test Sound" button initializes/resumes `AudioContext` across mobile browsers to overcome autoplay restrictions.
- **Web Notifications API**: Displays browser notifications on caregiver phones when tab is backgrounded.
- **Mobile Vibration API**: Urgent alert vibration pattern (`[400, 150, 400, 150, 400]`).
- **Connection Doctor**: Real-time LAN IP diagnostic tool, WebSocket latency monitor, and test ping button.

---

## 🔒 Privacy & Safety Guarantee

- **Zero Cloud Video**: No video frames or images ever leave the device. Only 21 geometric coordinate points are processed locally in browser RAM.
- **Software Only**: Requires no specialized hardware — runs on any standard laptop webcam and mobile phone browser.
- **Caregiver-Centric**: Assistive communication system; a human caregiver always acknowledges and attends to the patient.

---

## 🧪 Testing

```bash
# Run unit test suite (engine normalization, feature extraction, kNN, state machine, coach)
npm test

# Run full TypeScript check and production build
npm run build
```
