# REACH - Project Status Report

> **Status Date**: 2026-10-12  
> **Branch**: `experiments`  
> **Architecture**: Software-Only (Webcam + Phone Browser, zero hardware)  

---

## 1. Feature Status Matrix

| Module / Requirement | Built | Tested | Notes |
|---|:---:|:---:|---|
| **Facial Recognition Removal** | Yes | Yes | All face detection, FaceLandmarker, face blendshapes, distress tracking, and Comfort Watch gauges completely eliminated. |
| **MediaPipe Hand Tracking** | Yes | Yes | Bundled local WASM and `hand_landmarker.task`. 21 3D hand landmarks tracked entirely on-device. |
| **Landmark Normalization** | Yes | Yes | Palm-span scaling (wrist + MCP knuckles 5, 9, 17) prevents foreshortening; EMA smoothing filter ($\alpha = 0.65$) removes jitter. |
| **k-NN Classifier & State Machine** | Yes | Yes | Margin separation check, confidence threshold, 3-frame candidate latching, 1.2s hold ring, and rest state rejection. |
| **Multi-Patient Architecture** | Yes | Yes | Persistent registry in `data/patients.json`, `/api/patients` CRUD API, independent gesture models, and patient switcher. |
| **Teach REACH (`/teach`)** | Yes | Yes | Step-by-step wizard: select patient, manage/retrain gestures, rest hand baseline, 3-round training, and live validation. |
| **Patient Live Screen (`/live`)** | Yes | Yes | Live hand skeleton overlay, hold confirmation ring, telemetry HUD (confidence, margin, status), patient switcher, and QR code. |
| **Caregiver Dashboard (`/caregiver`)** | Yes | Yes | Real-time call feed, patient filtering, Web Notifications, Web Audio chimes, vibration, and 1-tap acknowledgement. |
| **Speaker & Audio Alerts** | Yes | Yes | Harmonic major triad chime for normal calls; rapid dual-tone siren for urgent alerts; "Test Sound" audio unlock button. |
| **Phone LAN Connectivity** | Yes | Yes | Direct Wi-Fi LAN routing (`http://10.132.241.116:5173/caregiver`), Connection Doctor reachability tester, and WebSocket heartbeat. |
| **Results Benchmark (`/results`)** | Yes | Yes | Confusion matrix calculator, live confidence stream, and 60s false-alarm tester. |
| **Settings (`/settings`)** | Yes | Yes | Sliders for hold duration, strictness, cooldown, dark mode night shift, and speech synthesizer. |

---

## 2. Network & Station Access Links

- **Computer Host**: `10.132.241.116`
- **Vite Web Port**: `5173`
- **Express / WebSocket Port**: `3000`
- **Teach Station**: `http://localhost:5173/teach`
- **Bedside Live Station**: `http://localhost:5173/live`
- **Caregiver Station (Laptop)**: `http://localhost:5173/caregiver`
- **Caregiver Phone (Wi-Fi)**: `http://10.132.241.116:5173/caregiver`
- **Judge Metrics**: `http://localhost:5173/results`
- **App Settings**: `http://localhost:5173/settings`

---

## 3. Verification & Test Suite

- **Unit Tests**: `npm test` runs 6 unit tests in `src/engine/__tests__/engine.test.ts` (all 6 pass).
- **TypeScript & Build**: `npm run build` compiles with 0 TypeScript errors and generates production bundles.
- **Routes Check**: All 6 routes (`/`, `/teach`, `/live`, `/caregiver`, `/results`, `/settings`) return HTTP 200 OK.
