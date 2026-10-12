# CHANGELOG - REACH

All notable changes to this project are documented in this file.
This project strictly adheres to a **SOFTWARE-ONLY** assistive communication architecture (webcam and phone browser only; zero external hardware).

---

## [1.3.0] - Patient ↔ Caregiver Phone Pairing & Inconsistent Gesture Rejection (2026-10-12)

### Fixed (Patient ↔ Caregiver Phone Connection)
- **Zero-Friction Device Pairing via QR Code & URL Query**:
  - Live bedside station encodes direct pairing links in QR codes (`http://<lan-ip>:5173/caregiver?pair=<patientId>`).
  - Scanning the QR code with any phone camera pairs the caregiver receiver directly to that specific patient session.
  - Server manages connected socket roles and tracks targeted pairing.
- **Explicit 4-State Connection Telemetry**:
  - Full tracking and visible badges for `CONNECTING`, `CONNECTED`, `DISCONNECTED`, and `RECONNECTING` on both bedside laptop and caregiver phone.
  - Prominent red alert banner with "Reconnect" and "Connection Doctor" buttons if phone loses network connectivity.
- **Strict Separation of Concerns**:
  - Bedside laptop provides non-intrusive bedside feedback (`Request Sent: WATER`, `Delivered to Caregiver Phone`, `ACKNOWLEDGED by Caregiver`).
  - Caregiver phone serves as the dedicated notification receiver: triggers permitted Web Audio chimes/sirens, phone vibration, and Web Notifications.
- **Targeted Notification Routing & Two-Way Acknowledgement**:
  - Requests route to paired caregivers (or all beds if multi-bed mode selected).
  - Tapping "Acknowledge" (or quick reply "On my way", "1 min") sends an instant ACK back to the bedside laptop, displaying caregiver name and timestamp in real time.
  - Delivery receipt confirmed back to the patient laptop.
- **Network Interface & Vite Proxy Resolution**:
  - `ReachWebSocket` dynamically targets `window.location.host` (using the same port that served the webpage via Vite's proxy on 5173 or direct Express on 3000), eliminating cross-port firewall blocks.

### Fixed (Gesture Training: Inconsistent Gesture Rejection)
- **Real-Time Sample Validation (`src/engine/validation.ts`)**:
  - Compares each captured sample feature vector (normalized coordinates, fingertip distances, joint angles) against running centroid.
  - Rejects inconsistent samples if distance exceeds threshold ($> 1.40$) or if hand is resting.
  - Live counters for valid vs rejected samples displayed in UI.
- **Multi-Round Session Consistency Verification**:
  - Computes pairwise spread across all rounds. Rejects training session if gestures were switched mid-session or spread exceeds $1.20$.
  - Displays clear warning: `"Your gestures are inconsistent. Please repeat the SAME gesture."`
  - Prevents saving until samples pass validation.
- **Inter-Gesture Ambiguity Detection**:
  - Compares candidate gesture against existing saved gestures for that patient.
  - Alerts user if a new gesture is physically too similar ($< 0.70$ distance) to an existing gesture (e.g. WATER vs HELP).
- **Persistent Quality Score**:
  - Computes and persists consistency quality score (0% to 100%) and valid samples.

---

## [1.2.0] - Multi-Patient & Gesture Recognition Overhaul (2026-10-12)

### Removed (Facial Recognition Removal)
- **Complete Elimination of Facial Recognition**:
  - Removed MediaPipe `FaceLandmarker`, `face_landmarker.task`, and facial blendshapes processing.
  - Removed `src/engine/distress.ts` and `src/engine/__tests__/distress.test.ts`.
  - Removed Comfort Watch / Distress Watch gauges, calibration wizards, and face blendshape consent modals from `/live`, `/teach`, and `/settings`.
  - Removed face gesture option (`😊 Face move`) from Teach flow.
  - Removed face distress cross-check rules and verdict feedback loops from `/caregiver`.
  - Kept system strictly focused on MediaPipe hand landmark tracking and personalized hand gestures.

### Added (Multi-Patient System)
- **Multi-Patient Management & Storage**:
  - Persistent patient store in `data/patients.json` with CRUD REST API (`GET`, `POST`, `PUT`, `DELETE` on `/api/patients`).
  - Pre-seeded out of the box with default profiles: Rachel (Bed 7), Ravi (Bed 4), and Meera (Bed 2).
  - Patient attributes: Unique ID, display name, bed/room number, assigned caregiver, active status, ability notes, custom settings, and independent gesture sets.
  - Patient switcher component on `/teach`, `/live`, and `/caregiver` allowing instant switching.
  - Patient filter dropdown on `/caregiver` to monitor specific assigned patients or all patients.
  - Patient-specific request history endpoint (`GET /api/patients/:id/requests`).
  - Export and import endpoints (`/api/patients/export` and `/api/patients/import`).

### Enhanced (Gesture Recognition & Normalization)
- **Robust Palm-Span Normalization**:
  - Replaced single-joint scaling with multi-joint palm span (landmarks 0, 5, 9, 17) to prevent foreshortening errors when hands tilt or middle knuckles bend.
- **Exponential Moving Average (EMA) Landmark Smoothing**:
  - Added `LandmarkSmoother` filter ($\alpha = 0.65$) on 21 3D coordinates across frames to eliminate tracking flicker and sensor jitter.
- **k-NN & Ambiguity Margin Verification**:
  - Strictly rejects rest state movements (`isRest: true`).
  - Enforces minimum confidence threshold ($\ge 0.60$) and separation margin ($\ge 0.08$) before latching.
- **Consecutive Frame Confirmation**:
  - Decision state machine requires 3 consecutive matching candidate frames and 1.2s hold duration before dispatching alerts.
- **Live Debug Telemetry HUD**:
  - Real-time display on `/live` and `/teach` showing recognized gesture, confidence %, margin %, and tracking status.

### Enhanced (Caregiver Phone Alerts & Speaker System)
- **Web Audio Multi-Tone Harmonic Alerts**:
  - Normal request: 3-tone harmonic major triad chime (C5 523Hz $\rightarrow$ E5 659Hz $\rightarrow$ G5 784Hz).
  - Urgent request: Rapid alternating dual-tone emergency siren (880Hz / 1175Hz alert pulses).
- **Audio Unlock & Test Speaker Button**:
  - User-initiated button initializes and resumes `AudioContext`, bypassing mobile browser autoplay restrictions.
  - Explicit troubleshooting feedback if audio output is blocked by browser policies.
- **Web Notifications API**:
  - Browser notifications on caregiver mobile devices when the webpage is backgrounded.
- **Mobile Vibration API**:
  - Urgent pattern (`[400, 150, 400, 150, 400]`) and normal vibration (`[250]`).
- **Connection Doctor Diagnostics**:
  - Real-time Wi-Fi IP detection (`http://10.132.241.116:5173/caregiver`), latency pinging, and diagnostic test ping buttons.

### Testing & Verification
- Unit test suite (`src/engine/__tests__/engine.test.ts`) passes 100% (6/6 tests).
- Production build (`npm run build`) compiles with zero TypeScript errors.
- End-to-end HTTP routes verified (`/`, `/teach`, `/live`, `/caregiver`, `/results`, `/settings`).
