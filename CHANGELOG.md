# CHANGELOG - REACH

All notable changes to this project are documented in this file.
This project strictly adheres to a **SOFTWARE-ONLY** architecture (laptop webcam and caregiver phone only; zero external hardware).

---

## [Unreleased] - demo-final (2026-10-11)

### Added
- **Feature A: Comfort Watch (Distress Watch)**:
  - Integrated offline MediaPipe FaceLandmarker (`public/mediapipe/face_landmarker.task`, 3.75 MB).
  - Continuous evaluation of 52 facial blendshape groupings (brow knit, squint, nose wrinkle, sustained eye closure, and mouth stretch).
  - Smile guard and Yawn guard to filter out natural facial expressions and laughter.
  - 10-second personal calm baseline calibration wizard with local storage persistence.
  - Safe clinical wording ("May need a check", "Signal strength", "Looks uncomfortable").
  - Real-time facial distress reaction gauge on `/live` with dynamic percentage, active cue badges (brow, squint, nose, eyes closed), and 1-click cooldown reset.
  - Instant pain & agony fast-trigger (1.5s detection for sharp expressions of discomfort/grimace).
  - Enforced monotonic timestamp safety on MediaPipe hand and face detection loops.
  - Caregiver feedback loop ("Needed care" / "False alarm") dynamically tuning sensitivity.
  - Cross-check rule: Pain gesture detected while face discomfort is elevated ($\ge 0.45$) raises priority to Urgent with "Face signal agrees" indicator.
- **Feature B: Face Movements as Gestures**:
  - Added `😊 Face move` gesture kind in `/teach` (Step 3).
  - 52-dimensional facial blendshape feature extraction vector (`extractFaceGestureFeatures`).
  - High-visibility facial contour contour mesh overlay on camera canvas.
  - Live face gesture recognition on `/live` with `(Face gesture 😊)` status callout.
- **Dual-Hand Support**:
  - Upgraded MediaPipe HandLandmarker to track up to 2 hands concurrently (`numHands: 2`).
  - Rendered dual skeletons with distinct colors (Teal for Hand 1, Rose/Indigo for Hand 2).
  - Real-time gesture evaluation with left/right hand coordinate mirroring.
- **Low-Light Night Mode**:
  - Added `🌙 Night Light` ambient screen glow and software video exposure boost (`brightness(1.4) contrast(1.3)`).
- **Caregiver Alert Routing**:
  - Added "Alerts on Phone Only 🔕" toggle on `/caregiver` to mute laptop chimes and route vibrations/audio exclusively to the caregiver's phone.
- **Connection Doctor & Phone Support**:
  - Built `npm run doctor` CLI and in-app Connection Doctor tab on `/caregiver`.
  - Added 1-click execution scripts `doctor.bat` and `open-app.bat`.
  - Written `PHONE_TROUBLESHOOTING.md` in simple Grade 5 English.
  - Expo / React Native companion app in `caregiver-app/`.
- **Preloaded 5 Standard Gestures**:
  - Preloaded Water, Pain, Bathroom, Move me, and Emergency in `seed/demo-profile.json` for instant out-of-the-box operation on clean clones.

### Changed
- Refactored kNN classifier with adaptive sample spread floor and Gaussian confidence distribution to prevent confidence collapse.
- Optimized camera video stream to 640×480 for consistent 30+ FPS tracking.
- Calibrated state machine candidate latch threshold to 3 frames with 250ms camera drop buffer for responsive gesture recognition.
- Bound Express and WebSocket server to `0.0.0.0:3000` with link-local and virtual interface filtering.

### Removed
- Complete removal of all hardware references, Web Serial, ESP32, beacons, and thermal hardware.

### Testing & Verification
- Unit test suite expanded from 5 to 13 tests (all 13 passing across `distress.test.ts` and `engine.test.ts`).
- Production build succeeds with 0 TypeScript compilation errors.
