# REACH - Tonight's Spec (verify everything, fix the phone, add Distress Watch)

## 0. Rules
- Read BUILD_SPEC.md first. It still defines the design system, simple-English rules, privacy and the base app. This file adds to it.
- NO HARDWARE of any kind. No ESP32, no beacon, no Web Serial, no thermal camera, no extra sensors. Only the laptop webcam and the phone. If any hardware code or hardware text exists anywhere in the repo (code, README, slides, pitch notes), remove it.
- Work on the git branch `experiments`. Never touch `main` until I say so.
- Work in the steps of section 8. After each step: run the app, test it in the browser, take screenshots, tell me what to check, then STOP and wait for "next".
- Never fake results or numbers. Every new feature has an off switch.
- SAFE WORDING: never say "pain detected" or "diagnosis". Say "May need a check", "Looks uncomfortable", "Signal strength". A nurse always decides.

## 1. Step 0 - Rerun and audit everything (do this first)
Goal: prove the whole base app works from a clean start, to the end of BUILD_SPEC.md (all 6 phases).
1. `git pull`, then a clean `npm install` (also inside `caregiver-app`). Delete `node_modules` and reinstall if anything is odd.
2. Start the app with `npm run dev`. Open /, /teach, /live, /caregiver, /results, /settings in the browser.
3. Compare the repo with BUILD_SPEC.md sections 3 to 13. Write `STATUS.md` with a table: feature, built (yes / partly / no), tested (yes / no), notes.
4. Finish anything marked partly or no from BUILD_SPEC phases 1 to 6, and run the acceptance checklist (BUILD_SPEC section 13). Fix every failure.
5. Make sure the 5 required hand gestures work end to end: teach, recognise, send, acknowledge, "Help is coming".
6. Run all unit tests. Fix failures. Commit on `experiments`.

## 2. Step 1 - Fix the phone / caregiver app (it does not work properly)
I do not know the exact error yet, so find the root cause yourself. Check each of these and fix what is wrong:
- The server must listen on `0.0.0.0` (all network interfaces), not only `localhost`.
- The phone must never be given `localhost` or `127.0.0.1`. It needs the laptop's real LAN IP. Pick the correct IP: skip virtual adapters (WSL, VirtualBox, Hyper-V, Docker, VPN); prefer the Wi-Fi or hotspot adapter. Show all candidate IPs and let me choose.
- The QR code on /live must contain the correct address, and the app must also allow typing the address by hand.
- WebSocket: plain `ws://` on the local network (no `wss`), same port as the server, with heartbeat ping/pong every 10 seconds and auto-reconnect with backoff. Handle the phone sleeping and waking.
- Expo: check the Expo SDK version matches the Expo Go app on the phone. Check Android cleartext traffic and the iOS "Local Network" permission. Make sure the app really uses `expo-haptics`, `expo-audio`, `expo-speech`, `expo-notifications`, `expo-keep-awake` correctly in Expo Go, and does not crash if one of them is not available.
- Windows firewall: print a clear message that tells me to allow Node on "Private networks" and how to do it.
- Add a **Connection doctor**:
  - Laptop side: `npm run doctor` prints the LAN IPs, whether the server port is open on each, the exact phone URL, and a QR code. It also warns when the Wi-Fi may block device-to-device traffic (client isolation) and suggests using the phone hotspot.
  - App side: a "Connection" screen that shows the server address, a reachability test (`GET /api/info`), the WebSocket state, the last error in plain English, and a "Send test request" button that proves the full path.
- Make the web caregiver page `/caregiver` work well in a phone browser too, as a backup (no app needed): big buttons, sound after a tap, and vibration on Android.
- Write `PHONE_TROUBLESHOOTING.md` with the top 6 problems and fixes, in simple English.
When done, tell me exactly how to test on my phone (hotspot method first).

## 3. Feature A - Distress Watch (face) - MAIN NEW FEATURE
Goal: if a person's face looks uncomfortable for a long time, tell the caregiver. It is OPTIONAL and needs consent.

### 3.1 Tracking
- Use MediaPipe FaceLandmarker (`@mediapipe/tasks-vision`) with `outputFaceBlendshapes: true`, `numFaces: 1`, VIDEO mode. Bundle `face_landmarker.task` in `public/mediapipe/` so it works offline. Run it in the same camera loop as the hand tracker (share the video element). If FPS drops below 15, run the face model every 2nd frame.
- It outputs 52 blendshape values from 0 to 1. Use only these groups:
  - brow = mean(browDownLeft, browDownRight)
  - squint = mean(eyeSquintLeft, eyeSquintRight, cheekSquintLeft, cheekSquintRight)
  - nose = mean(noseSneerLeft, noseSneerRight, mouthUpperUpLeft, mouthUpperUpRight)
  - close = mean(eyeBlinkLeft, eyeBlinkRight), counted only if it stays high for more than 0.5 seconds (blinks are ignored)
  - mouth = mean(mouthStretchLeft, mouthStretchRight, jawOpen), small weight
  - smile = mean(mouthSmileLeft, mouthSmileRight), used only as a guard

### 3.2 Personal baseline (this is what makes it fair)
- Step 1 "Relax your face for 10 seconds". Save the median and spread of each group. All later numbers are measured against THIS person's calm face.
- Step 2 (optional, for demo) "Now make your strongest uncomfortable face for 3 seconds" to set each person's scale. If skipped, use default scales. Say clearly this is acted, not real.
- Save the baseline in the profile. Allow "Recalibrate" at any time.

### 3.3 Score and decision (put in `src/engine/distress.ts`, unit-test it)
- Per frame: delta of each group above baseline, scaled to 0..1.
- `score = 0.30*brow + 0.25*squint + 0.20*nose + 0.15*close_sustained + 0.10*mouth`
- Smile guard: if smile is high above baseline, cut the squint part (a real smile also lifts the cheeks). Yawn guard: ignore frames with jawOpen above 0.6.
- Quality gate: skip frames with no face, face turned more than about 35 degrees, or bad light. If more than half of the window is skipped, show "I can't see your face well" and send NOTHING.
- Level 1 "May need a check": score >= 0.45 on at least 70% of frames for 8 seconds AND at least 2 of the 4 core groups (brow, squint, nose, close) are raised at the same time.
- Level 2 "Needs a check now": same rule for 20 seconds, OR Level 1 plus the person also sent a Pain or Emergency hand request.
- All numbers are sliders in Settings. Cooldown 2 minutes after the caregiver answers.
- Cross-check rule: if a Pain request is sent while Distress Watch is Level 1 or higher, raise the request priority one step and show "Face signal agrees" on the caregiver card.

### 3.4 Caregiver feedback loop
- Caregiver card buttons: "I'm going" (acknowledge), then "Needed care" or "False alarm".
- "False alarm" raises that person's threshold by 0.05 (never above 0.65). "Needed care" lowers it by 0.02 (never below 0.35). Show "Sensitivity changed" with a Reset button. Hand requests are never affected.

### 3.5 Screens
- Patient /live: small calm card "Comfort watch: On" with a lock icon and "Your video stays on this laptop." Toggle plus a consent checkbox the first time. When an alert is sent: "We asked a nurse to check on you."
- Caregiver card (laptop and app): title "May need a check", bed and name, time, "Signal strength" bar, small chips for which signals were raised (Brow, Eyes, Nose, Eyes closed), a 60-second sparkline of the score (numbers only, no video, no photo), buttons "I'm going", "Needed care", "False alarm".
- Priority: Level 1 = Important (amber), Level 2 = Urgent (red). Unanswered for 30 seconds = escalate, same as other requests.
- /results: add "Distress Watch test": 10-minute idle test where the team talks, laughs, yawns, looks around (goal: zero alerts) and a timed test where someone acts a sustained grimace (shows time to alert). Show these two numbers. Label the second one "acted, not real".

### 3.6 Messages (extend BUILD_SPEC section 9)
- Same `request` message, with extra fields: `source: "hand" | "face"`, `score`, `durationSec`, `signals: {brow,squint,nose,close}`, `history: number[60]`, `level: 1|2`.
- New: `{type:"feedback", id, verdict:"needed_care" | "false_alarm"}` from caregiver to server. Server stores it and sends the new sensitivity to the patient page.


## 4. Feature B - Face movements as gestures (only if time allows)
For people who cannot use their hands, let Teach also learn FACE movements: blink twice, raise eyebrows, open mouth, turn head. Reuse the same teach flow, kNN engine and state machine, but use a feature vector of the 52 blendshapes (and head tilt) instead of hand points. Let the person choose "Hand" or "Face" in Teach step 3. Each movement keeps its own personal threshold. Show a face skeleton instead of hand skeleton. This keeps our message true: REACH learns the movement the person CAN make.


## 5. Feature C - Pulse trend from the camera (EXPERIMENTAL, last step, OFF by default)
Only build this if every earlier step is finished and stable. Skip it otherwise.
- Why: it gives a second, software-only body signal next to the face check. Research says camera-based pulse (rPPG) can work with an ordinary webcam but is easily damaged by head motion, poor light, and camera settings, and results vary a lot. So we treat it as a quality-gated trend, never as a measurement we trust alone.
- How: use the FaceLandmarker landmarks to pick forehead and cheek regions. Average the green channel per frame over a 15 second window at 15 FPS or more. Remove the slow trend, band-pass between 0.7 and 3 Hz, and find the strongest frequency (FFT). Convert to beats per minute.
- Quality gate: compute a signal quality score from head movement, light level and how clearly one frequency stands out. Only show a number when quality is good. Otherwise show "Pulse: not clear". Never send an alert from pulse alone.
- Use: show "Pulse trend: about 72 (low quality)" with the quality label on /live in the debug panel and on the caregiver card as small grey text. It may add one small point to the cross-check rule only when quality is high.
- Wording: "Experimental. Not a medical measurement." Off by default, needs the same consent as Comfort watch.
- Test honestly: compare with a hand-counted pulse (count for 15 seconds, multiply by 4) on 3 people, and report the real differences in /results. Do not claim an accuracy figure that was not measured.

## 6. About thermal cameras (NO code, documentation only)
A normal webcam cannot measure body temperature. A thermal camera is extra hardware and we are using no hardware. So we do NOT build a thermal feature. Instead:
- Put a "Future work" section in the README and a note for the slides: "Thermal-ready by design: REACH treats every sensor as a plug-in 'signal' (hand, face, pulse; thermal later)."
- Add this honest text: thermal cameras read skin surface temperature, not core temperature, and the US FDA says they should only be used one person at a time and confirmed with another method. Research on facial temperature and pain or stress is promising but inconsistent (some studies find temperature rises, others find it falls), and a review found it does not replace other pain assessment methods. A real thermal feature would need a thermal camera, calibration and a clinical study.
- Keep the code structured so a new sensor can be added later: a small `Signal` interface (id, value, quality, timestamp). Do not build any thermal code or fake thermal view.

## 7. Settings, consent and copy
- Settings -> "Comfort watch" (off by default), "Pulse trend (experimental)" (off by default), sensitivity sliders, "Recalibrate", "Reset learned sensitivity".
- About card: "Your video stays on this device. Only face and hand numbers are used. Not a medical device."
- Simple English (Grade 5): "Comfort watch is on." "Relax your face for 10 seconds." "I can't see your face well. Move a little closer or turn on a light." "We asked a nurse to check on you." "May need a check." "Needed care" / "False alarm."

## 8. Build order (stop and wait for "next" after each)
1. Step 0: rerun and audit everything, write STATUS.md, finish gaps, tests green.
2. Step 1: fix the phone: connection doctor, correct IP and QR, troubleshooting file, phone-browser backup page.
3. Distress Watch part 1: face tracking, 10-second baseline, score engine with unit tests, numbers-only debug view.
4. Distress Watch part 2: patient toggle and consent, alert to caregiver card (laptop, phone browser and app), feedback buttons, escalation, cross-check rule.
5. /results tests for Distress Watch (10-minute false-alarm test, time-to-alert test), settings, polish.
6. Only if time allows: Feature B (face movements as gestures).
7. Only if time allows: Feature C (pulse trend, experimental).
8. Freeze: update README (features, setup, phone steps, limits, future work with the thermal note), CHANGELOG, remove any hardware mention, run the full checklist, commit, and tell me to merge `experiments` into `main` and tag `demo-final`.

## 9. Acceptance checklist
- [ ] Clean clone: `npm install` and `npm run dev` work. All routes open.
- [ ] STATUS.md shows every BUILD_SPEC feature as built and tested.
- [ ] 5 hand gestures: teach, recognise, send, acknowledge, "Help is coming".
- [ ] Phone: connects on the hotspot and on Wi-Fi, the test request arrives in under 1 second, sound and vibration work (Android), Connection doctor explains any failure in plain English.
- [ ] Baseline for Distress Watch takes 10 seconds and is saved.
- [ ] 10 minutes of talking, laughing, yawning, looking around: zero face alerts.
- [ ] A sustained acted grimace creates a Level 1 alert in about 8-10 seconds and Level 2 at about 20 seconds.
- [ ] Face turned away or covered: "I can't see your face well", no alert.
- [ ] Caregiver card shows chips, sparkline, three buttons. "False alarm" changes sensitivity and can be reset.
- [ ] Pain request + face signal raises priority and shows "Face signal agrees".
- [ ] No hardware code or hardware text anywhere. No video or photo is saved or sent.
- [ ] README, CHANGELOG, PHONE_TROUBLESHOOTING.md and /results are up to date.

## 10. Honest limits (put in README and About)
Facial signals can look like other feelings (for example disgust, sadness, fear or anger), and studies show face-analysis tools can work worse on some skin tones and on faces with tubes, tape, bandages or facial weakness. Acted expressions are not real pain. So REACH only asks a person to check, it never says what the person feels. It is a prototype, not a medical device.
