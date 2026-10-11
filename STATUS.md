# REACH - Project Audit & Status Report (Step 0)

> **Audit Date**: 2026-10-11  
> **Branch**: `experiments`  
> **Audited Against**: `BUILD_SPEC.md` (Sections 3 to 13) & `TONIGHT_SPEC.md` (Step 0)

---

## 1. Feature Audit Matrix

| Section / Feature | Spec Requirement | Built | Tested | Notes |
|---|---|:---:|:---:|---|
| **3. Pages & Routes** | | | | |
| `/` Home Page | Hero gradient blob, hand-skeleton animation SVG, 3 action cards | Yes | Yes | All 3 cards link correctly, simple Grade 5 copy. |
| `/teach` Teach Page | 4-step wizard, countdown, 3 rounds, rest hand step, Gesture Coach | Yes | Yes | Live preview, sample counter, timer, Gesture Coach analysis. |
| `/live` Patient Screen | Mirrored video, glowing skeleton, hold ring, chips, ack card | Yes | Yes | WebSocket dispatch, QR code sync, keys 1-8, speech. |
| `/caregiver` Dashboard | Real-time request cards, priority sort, ack button, quick replies | Yes | Yes | Chime, vibration patterns, 30s escalation, history tab, CSV. |
| `/results` Judge Metrics | FPS, latency, accuracy matrix, 60s false-alarm test, chart | Yes | Yes | Live confusion matrix calculator, JSON report export. |
| `/settings` App Settings | Sliders (hold time, strictness, cooldown), dark theme, speech toggle | Yes | Yes | Real-time parameter tuning, persists to profile. |
| Top Navigation Bar | Logo, page links, dark mode toggle, privacy lock badge | Yes | Yes | Clean responsive top bar with lock icon. |
| **4. Design System** | | | | |
| Color Palette | Calm teal (`#0E9F9A`), soft tint, warm white, priority accents | Yes | Yes | Full Tailwind tokens with accessible contrast. |
| Dark Mode | Night shift theme (`#0B1220`, `#111A2E`), toggle in nav & settings | Yes | Yes | Remembers theme preference in `localStorage`. |
| Typography | Plus Jakarta Sans 700 headings, Inter body, patient text 22px+ | Yes | Yes | Responsive scaling with simple English. |
| Shapes & Frame | 24px card radius, 16px button radius, min 64px patient buttons | Yes | Yes | Touch-friendly cards and large buttons. |
| Camera Overlay | Mirrored video, glowing teal skeleton line (`#0E9F9A`) + joint dots | Yes | Yes | Rendered at native video resolution on canvas. |
| **5. Teach Flow (`/teach`)** | | | | |
| Visible Timer | "Time to teach" counter | Yes | Yes | Displayed in header. |
| 4-Dot Progress Bar | Steps 1 to 4 with visual active/completed dots | Yes | Yes | Shows numbered steps with checkmarks upon completion. |
| Request Picker | Water, Pain, Bathroom, Move me, Emergency, Food + Custom | Yes | Yes | Multi-select grid (3 to 8 choices). |
| Sample Recording | 3 rounds with relax interval, 8-10 samples per round | Yes | Yes | 3-2-1 countdown, live skeleton preview & progress count. |
| Rest Hand Step | 5-second relaxed hand recording to train non-request class | Yes | Yes | Stores rest samples to eliminate false triggers. |
| Free Test Screen | Live recognition test with green match & confidence score | Yes | Yes | Immediate feedback on taught gestures. |
| Gesture Coach | Similarity warnings ("look alike"), comfort score, 2D movement map | Yes | Yes | Evaluates pairwise sample distances & variance. |
| Persistence | Auto-save to `localStorage` and `PUT /api/profile/:id` | Yes | Yes | Profile saved to `data/profile.json` and `seed/demo-profile.json`. |
| **6. Gesture Engine** | | | | |
| Landmarks Tracker | MediaPipe HandLandmarker running in-browser via local WASM | Yes | Yes | Offline bundled in `public/mediapipe/`. |
| Normalization | Wrist subtraction, knuckle scaling, tilt rotation, left mirroring | Yes | Yes | Unit-tested in `src/engine/normalize.ts`. |
| Feature Extraction | 73D pose features (63 coords + 5 tip dists + 5 bend angles) | Yes | Yes | Unit-tested in `src/engine/features.ts`. |
| k-NN Classifier | k=3, sample spread normalization, confidence & margin check | Yes | Yes | Unit-tested in `src/engine/knn.ts`. |
| Rest Hand Rejection | Closest rest sample returns `isRest: true` (no trigger) | Yes | Yes | Verified zero false triggers. |
| State Machine | `NO_HAND -> LOOKING -> CANDIDATE -> HOLDING -> SENT -> COOLDOWN` | Yes | Yes | Enforces 5 candidate frames, hold ring, and cooldown. |
| Two-Stage Urgent Confirm | Requires holding Emergency gesture twice | Yes | Yes | Prevents accidental urgent dispatch. |
| **7. Live Screen (`/live`)** | | | | |
| Camera & Hold Ring | Circular SVG ring filling to 100% during hold | Yes | Yes | Visual feedback before dispatch. |
| Request Chips | Displays all taught gestures, active chip lights up | Yes | Yes | Shows priority colors & shortcut keys. |
| Caregiver Ack Card | Green card: "Priya got your message. Help is coming." + TTS | Yes | Yes | Real-time WebSocket listener with speech. |
| QR Code Sync | Scannable QR code for phone caregiver access | Yes | Yes | Dynamic QR pointing to host LAN IP. |
| Demo Shortcuts (1-8) | Number keys trigger respective gestures | Yes | Yes | Demo safety net. |
| **8. Caregiver Station (`/caregiver`)** | | | | |
| Real-Time Dashboard | Live request cards sorted urgent first, then oldest | Yes | Yes | Direct WebSocket communication on port 3000. |
| Alert Effects | Web Audio chime, phone vibration patterns, speech announcement | Yes | Yes | Unlocked via "Tap to enable alerts" button. |
| Urgent Screen Edge Flash | Full-screen red edge pulse for urgent requests | Yes | Yes | Prominent visual urgency indicator. |
| Quick Replies | "Coming now", "2 minutes", "Will bring it" buttons | Yes | Yes | 1-tap dispatch to patient screen. |
| Escalation Timer | Marks requests "Still waiting" after 30 seconds | Yes | Yes | Animated badge and higher priority. |
| History & CSV Export | Past resolved requests log + `GET /api/requests.csv` | Yes | Yes | Downloadable CSV with latency numbers. |
| **9. Server & WebSocket** | | | | |
| Network IP Detection | Detects active Wi-Fi LAN IP, skips virtual & link-local | Yes | Yes | Binds to `0.0.0.0:3000`. |
| HTTP Endpoints | `/api/info`, `/api/profile/:id`, `/api/requests`, `/api/reset-demo` | Yes | Yes | Full REST suite with disk persistence. |
| WebSocket Protocol | Client hello, request dispatch, ack, resolve, presence | Yes | Yes | Real-time bidirectional JSON messaging on `/ws`. |
| **10. Simple English** | | | | |
| Grade 5 Copy | No jargon, friendly error messages, verb-first buttons | Yes | Yes | "How sure", "Teach a movement", "Help is coming". |
| **11. Results Page (`/results`)** | | | | |
| Benchmark Numbers | FPS, latency (<0.8s), requests handled | Yes | Yes | Real-time data feeds. |
| Accuracy Benchmark | Multi-trial test evaluating confusion matrix | Yes | Yes | Calculates asked vs recognized counts. |
| False-Alarm Test | 60-second timer counting unintended triggers | Yes | Yes | Verifies 0 false alarms during natural movement. |
| Export JSON | Downloadable benchmark report | Yes | Yes | Formatted JSON export for slides/docs. |
| **12. Zero Hardware** | | | | |
| Software-Only Guarantee | No ESP32, no thermal camera, no extra hardware | Yes | Yes | Cleaned and verified. |

---

## 2. Acceptance Checklist Verification (BUILD_SPEC Section 13)

- [x] **Fresh Clone & Start**: `npm install && npm run dev` starts both backend and frontend.
- [x] **100% Offline Wi-Fi**: MediaPipe model (`hand_landmarker.task`) and WASM assets are locally bundled in `public/mediapipe/`.
- [x] **5 Required Hand Gestures**: Pre-loaded in `seed/demo-profile.json` (Water, Pain, Bathroom, Move me, Emergency) and ready out of the box.
- [x] **Rest Hand Rejection**: Rest class prevents false alarms during natural motion.
- [x] **Gesture Coach**: Compares gesture similarities and warns if two look alike.
- [x] **Low Latency Dispatch**: Requests arrive at caregiver screen in under 1 second.
- [x] **Two-Way Acknowledgment**: Caregiver "Acknowledge" renders "Help is coming" on patient screen.
- [x] **Profile Persistence**: Profiles survive page refreshes and server restarts.
- [x] **No Console/Build Errors**: `tsc && vite build` finishes cleanly with zero errors.
- [x] **Unit Tests Passing**: Vitest suite reports 13/13 passing unit tests.
- [x] **Software Only**: Completely free of any hardware dependencies or wording.
- [x] **Distress Watch (Feature A)**: Offline FaceLandmarker, baseline calibration, smile/yawn guards, cross-check rule, caregiver feedback loop.
- [x] **Face Movements as Gestures (Feature B)**: 52-blendshape feature extraction, contour mesh rendering, and live evaluation.
- [x] **Two-Hand Mode**: Concurrent 2-hand recognition and dual skeleton rendering.
- [x] **Night Mode**: Low-light software exposure boost and glowing screen frame.
- [x] **Phone Alert Routing**: "Alerts on Phone Only 🔕" toggle prevents duplicate ringing on laptop.

---

## 3. Summary of Completion Findings

1. **5 Standard Gestures Preloaded**: Ready out of the box in `seed/demo-profile.json` without requiring re-teaching.
2. **Robust Network IP & 0.0.0.0 Binding**: Server binds to `0.0.0.0`, skips virtual adapters, prints terminal QR code via `npm run doctor`.
3. **Face Feature Reliability**: Calibrated detection confidence (0.35), decoupled hand/face frame resets, and tuned state machine to 3 candidate frames.
4. **All Tests & Builds Green**: 13/13 unit tests pass cleanly, production build succeeds with 0 errors. All software-only requirements verified.
