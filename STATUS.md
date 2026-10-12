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
| **Inconsistent Gesture Rejection** | Yes | Yes | `src/engine/validation.ts`: compares samples against centroid and rest baseline, rejects inconsistent poses, prevents saving mixed gestures, detects inter-gesture ambiguity. |
| **Caregiver Phone Pairing** | Yes | Yes | QR code on bedside encodes direct pairing link (`?pair=<patientId>`), phone auto-pairs, displays active patient pairing banner. |
| **Connection States (4 States)** | Yes | Yes | Visible badges for `CONNECTING`, `CONNECTED`, `DISCONNECTED`, `RECONNECTING` on both bedside laptop and caregiver phone. |
| **Separation of Concerns** | Yes | Yes | Bedside displays non-intrusive feedback and delivery/ack status; caregiver phone receives alerts, audio sirens, vibration, and handles acknowledgements. |
| **Speaker & Audio Alerts** | Yes | Yes | Harmonic major triad chime for normal calls; rapid dual-tone siren for urgent alerts; "Test Sound" audio unlock button. |
| **Phone LAN Connectivity** | Yes | Yes | Direct Wi-Fi LAN routing (`http://10.132.241.116:5173/caregiver?pair=patient_1`), Connection Doctor reachability tester, and WebSocket heartbeat. |
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
- **Caregiver Phone (Paired Rachel)**: `http://10.132.241.116:5173/caregiver?pair=patient_1`
- **Judge Metrics**: `http://localhost:5173/results`
- **App Settings**: `http://localhost:5173/settings`

---

## 3. Verification & Test Suite

- **Unit Tests**: `npm test` runs 13 unit tests in `validation.test.ts` and `engine.test.ts` (all 13 pass).
- **End-to-End Workflow**: `node scripts/e2e-workflow-test.mjs` verifies the complete patient-to-caregiver phone lifecycle (all 5 steps pass: Pairing, Presence, Gesture Dispatch, Delivery Receipt, Acknowledgement roundtrip).
- **TypeScript & Build**: `npm run build` compiles with 0 TypeScript errors and generates production bundles.
- **Routes Check**: All 6 routes (`/`, `/teach`, `/live`, `/caregiver`, `/results`, `/settings`) return HTTP 200 OK.
