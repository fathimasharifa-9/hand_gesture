import React, { useEffect, useState, useRef } from 'react';
import { CameraView } from '../components/CameraView';
import { extractPoseFeatures } from '../engine/features';
import { normalizeLandmarks } from '../engine/normalize';
import { classifyGesture } from '../engine/knn';
import { DecisionStateMachine } from '../engine/stateMachine';
import { Landmark, UserProfile } from '../engine/types';
import { getStoredProfile, saveProfile } from '../utils/profileStorage';
import { ReachWebSocket } from '../utils/websocket';
import {
  DistressWatchTracker,
  PersonalFaceBaseline,
  DEFAULT_FACE_BASELINE,
  extractFaceSignals,
  FaceSignals,
} from '../engine/distress';
import QRCode from 'qrcode';
import {
  Wifi,
  Volume2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  QrCode,
  ExternalLink,
  Keyboard,
  Sparkles,
  ShieldAlert,
  Moon,
  Smile,
  Activity,
  HeartHandshake,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const LivePage: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile>(getStoredProfile());
  const [fps, setFps] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [caregiverCount, setCaregiverCount] = useState<number>(0);

  // Gesture Engine State
  const stateMachineRef = useRef<DecisionStateMachine>(
    new DecisionStateMachine(profile.settings)
  );

  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);
  const [engineStatusMsg, setEngineStatusMsg] = useState<string>('Bring hand into camera');
  const [urgentConfirmPrompt, setUrgentConfirmPrompt] = useState<boolean>(false);

  // Distress Watch (Comfort Watch) State
  const [comfortWatchEnabled, setComfortWatchEnabled] = useState<boolean>(() => {
    return localStorage.getItem('reach_comfort_watch') === 'true';
  });
  const [faceConsentGiven, setFaceConsentGiven] = useState<boolean>(() => {
    return localStorage.getItem('reach_face_consent') === 'true';
  });
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);
  const [showCalibrateModal, setShowCalibrateModal] = useState<boolean>(false);
  const [calibrateCountdown, setCalibrateCountdown] = useState<number>(10);
  const [currentDistressScore, setCurrentDistressScore] = useState<number>(0);
  const [distressAlertMsg, setDistressAlertMsg] = useState<string | null>(null);

  const distressTrackerRef = useRef<DistressWatchTracker>(
    new DistressWatchTracker(profile.faceBaseline || DEFAULT_FACE_BASELINE, {
      enabled: comfortWatchEnabled,
    })
  );

  const calibrationSamplesRef = useRef<FaceSignals[]>([]);

  // Active Sent Request State
  const [sentRequest, setSentRequest] = useState<{
    id: string;
    label: string;
    priority: string;
    triggeredAt: number;
    status: 'sent' | 'acked';
    caregiverName?: string;
    quickReply?: string;
  } | null>(null);

  // QR Code URL
  const [caregiverQrUrl, setCaregiverQrUrl] = useState<string>('');
  const [qrDataUri, setQrDataUri] = useState<string>('');
  const [candidateIps, setCandidateIps] = useState<any[]>([]);

  const updateQrCode = (url: string) => {
    setCaregiverQrUrl(url);
    QRCode.toDataURL(url, { margin: 2, width: 200 })
      .then((uri) => setQrDataUri(uri))
      .catch(console.error);
  };

  // WebSocket reference
  const wsRef = useRef<ReachWebSocket | null>(null);

  // Load profile and setup WebSocket
  useEffect(() => {
    const prof = getStoredProfile();
    setProfile(prof);
    stateMachineRef.current.updateSettings(prof.settings);

    // Fetch server LAN info for QR Code
    fetch('/api/info')
      .then((res) => res.json())
      .then((data) => {
        if (data.candidateIps) setCandidateIps(data.candidateIps);
        const cUrl = data.caregiverUrl || `${window.location.protocol}//${window.location.host}/caregiver`;
        updateQrCode(cUrl);
      })
      .catch(() => {
        const fallbackUrl = `${window.location.protocol}//${window.location.host}/caregiver`;
        updateQrCode(fallbackUrl);
      });

    // Connect WebSocket
    const ws = new ReachWebSocket('patient', prof.name || 'Ravi');
    wsRef.current = ws;
    ws.connect();

    ws.on('connection', (status: boolean) => setWsConnected(status));
    ws.on('presence', (data: any) => setCaregiverCount(data.caregivers || 0));

    ws.on('feedback:applied', (data: any) => {
      distressTrackerRef.current.updateSensitivity(data.verdict);
    });

    ws.on('request:acked', (data: any) => {
      setSentRequest((prev) => {
        if (prev && prev.id === data.id) {
          if (prof.settings.speak && 'speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(
              `${data.caregiverName} got your message. Help is coming.`
            );
            window.speechSynthesis.speak(utterance);
          }
          return {
            ...prev,
            status: 'acked',
            caregiverName: data.caregiverName,
            quickReply: data.quickReply,
          };
        }
        return prev;
      });
    });

    return () => {
      ws.disconnect();
    };
  }, []);

  // Sync comfort watch setting
  useEffect(() => {
    distressTrackerRef.current.updateSettings({ enabled: comfortWatchEnabled });
    localStorage.setItem('reach_comfort_watch', String(comfortWatchEnabled));
  }, [comfortWatchEnabled]);

  // Handle Comfort Watch Toggle with Consent Gate
  const handleToggleComfortWatch = () => {
    if (!comfortWatchEnabled && !faceConsentGiven) {
      setShowConsentModal(true);
      return;
    }
    setComfortWatchEnabled(!comfortWatchEnabled);
  };

  const handleGrantConsent = () => {
    setFaceConsentGiven(true);
    localStorage.setItem('reach_face_consent', 'true');
    setShowConsentModal(false);
    setComfortWatchEnabled(true);
    // Start calibration if not calibrated
    if (!profile.faceBaseline?.isCalibrated) {
      startFaceCalibration();
    }
  };

  // 10-Second Face Calibration Wizard
  const startFaceCalibration = () => {
    calibrationSamplesRef.current = [];
    setCalibrateCountdown(10);
    setShowCalibrateModal(true);

    const timer = setInterval(() => {
      setCalibrateCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          finishCalibration();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const finishCalibration = () => {
    setShowCalibrateModal(false);
    const samples = calibrationSamplesRef.current;
    if (samples.length > 5) {
      // Calculate median for calm baseline
      const keys: (keyof FaceSignals)[] = ['brow', 'squint', 'nose', 'close', 'close_sustained', 'mouth', 'smile', 'jawOpen'];
      const calmMedians: any = {};
      const spreadValues: any = {};

      keys.forEach((k) => {
        const sorted = samples.map((s) => s[k]).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        calmMedians[k] = sorted[mid];
        spreadValues[k] = Math.max(0.04, sorted[sorted.length - 1] - sorted[0]);
      });

      const newBaseline: PersonalFaceBaseline = {
        calm: calmMedians,
        spread: spreadValues,
        isCalibrated: true,
        calibratedAt: Date.now(),
      };

      const updatedProfile = { ...profile, faceBaseline: newBaseline };
      setProfile(updatedProfile);
      saveProfile(updatedProfile);
      distressTrackerRef.current.updateBaseline(newBaseline);
    }
  };

  // Process Hand Landmarks
  const handleLandmarks = (landmarks: Landmark[][] | null) => {
    if (!landmarks || landmarks.length === 0 || profile.gestures.length === 0) {
      const update = stateMachineRef.current.processFrame(null);
      setHoldProgress(update.holdProgress);
      setDetectedLabel(null);
      setEngineStatusMsg(update.statusMessage);
      setUrgentConfirmPrompt(false);
      return;
    }

    const raw = landmarks[0];
    const normalized = normalizeLandmarks(raw, false, profile.settings.ignoreTilt);
    const features = extractPoseFeatures(normalized);
    const result = classifyGesture(features, profile.gestures, profile.restSamples);

    const update = stateMachineRef.current.processFrame(result);

    setHoldProgress(update.holdProgress);
    setDetectedLabel(update.matchedLabel);
    setEngineStatusMsg(update.statusMessage);
    setUrgentConfirmPrompt(update.needsUrgentConfirm);

    if (update.shouldSendRequest && update.matchedLabel) {
      const matchedDef = profile.gestures.find((g) => g.label === update.matchedLabel);
      sendGestureRequest(
        update.matchedLabel,
        matchedDef?.priority || 'normal',
        result.confidence
      );
    }
  };

  // Process Face Blendshapes for Distress Watch
  const handleFaceBlendshapes = (blendshapes: Record<string, number> | null) => {
    if (showCalibrateModal && blendshapes) {
      const sigs = extractFaceSignals(blendshapes, 0);
      calibrationSamplesRef.current.push(sigs);
      return;
    }

    if (!comfortWatchEnabled || !blendshapes) return;

    const decision = distressTrackerRef.current.processFrame(blendshapes);
    setCurrentDistressScore(decision.score);

    if (decision.shouldTriggerAlert) {
      sendDistressAlert(decision);
    }
  };

  // Dispatch Hand Gesture Request
  const sendGestureRequest = (
    label: string,
    priority: 'normal' | 'important' | 'urgent',
    confidence: number
  ) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    // Cross-check: If Pain request is triggered while distress score >= 0.45, elevate priority
    let finalPriority = priority;
    let faceAgrees = false;
    if (label === 'Pain' && currentDistressScore >= 0.45) {
      finalPriority = 'urgent';
      faceAgrees = true;
    }

    const newReq = {
      id: requestId,
      patientId: profile.id,
      patientName: profile.name,
      bed: profile.bed,
      label,
      priority: finalPriority,
      confidence,
      source: 'hand',
      faceAgrees,
      triggeredAt: Date.now(),
    };

    setSentRequest({
      id: requestId,
      label,
      priority: finalPriority,
      triggeredAt: Date.now(),
      status: 'sent',
    });

    if (wsRef.current) {
      wsRef.current.send({
        type: 'request',
        request: newReq,
      });
    }
  };

  // Dispatch Distress Watch Alert
  const sendDistressAlert = (decision: any) => {
    const alertId = `distress_${Date.now()}`;
    const level = decision.level;
    const req = {
      id: alertId,
      patientId: profile.id,
      patientName: profile.name,
      bed: profile.bed,
      label: level === 2 ? 'Needs a check now' : 'May need a check',
      priority: level === 2 ? 'urgent' : 'important',
      confidence: decision.score,
      source: 'face',
      level,
      score: decision.score,
      durationSec: decision.durationSec,
      signals: decision.activeSignals,
      history: decision.recentScores,
      triggeredAt: Date.now(),
    };

    setDistressAlertMsg('We asked a nurse to check on you.');
    setTimeout(() => setDistressAlertMsg(null), 8000);

    if (wsRef.current) {
      wsRef.current.send({
        type: 'request',
        request: req,
      });
    }
  };

  // Keyboard Shortcuts (1-8)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= profile.gestures.length) {
        const targetGesture = profile.gestures[num - 1];
        if (targetGesture) {
          sendGestureRequest(targetGesture.label, targetGesture.priority, 0.95);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [profile, currentDistressScore]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft">
        <div className="flex items-center gap-3">
          <div
            className={`w-3.5 h-3.5 rounded-full ${
              wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
          <span className="font-heading font-bold text-sm sm:text-base text-brand-ink dark:text-white">
            {wsConnected
              ? `Connected to Caregiver (${caregiverCount} online)`
              : 'Trying to connect to caregiver station...'}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Comfort Watch Toggle */}
          <button
            onClick={handleToggleComfortWatch}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-colors ${
              comfortWatchEnabled
                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
            title="Automatically alerts a nurse if your face looks uncomfortable for a sustained time"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{comfortWatchEnabled ? 'Comfort Watch: ON' : 'Comfort Watch: OFF'}</span>
          </button>

          {comfortWatchEnabled && (
            <button
              onClick={startFaceCalibration}
              className="text-xs text-brand-teal hover:underline font-bold"
            >
              Recalibrate Face
            </button>
          )}

          <div className="text-xs text-brand-muted dark:text-dark-muted font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
            {profile.name} • {profile.bed}
          </div>
        </div>
      </div>

      {/* Gentle Distress Alert Notice */}
      <AnimatePresence>
        {distressAlertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-300 dark:border-teal-700 text-teal-900 dark:text-teal-200 text-center font-heading font-bold text-base shadow-md flex items-center justify-center gap-2"
          >
            <HeartHandshake className="w-5 h-5 text-brand-teal shrink-0" />
            <span>{distressAlertMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid: Camera & Status Column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Camera View */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="aspect-[4/3] w-full relative">
            <CameraView
              onLandmarksDetected={handleLandmarks}
              onFpsUpdate={(val) => setFps(val)}
              holdProgress={holdProgress}
              detectedLabel={detectedLabel}
              enableFaceTracking={comfortWatchEnabled || showCalibrateModal}
              onFaceBlendshapesDetected={handleFaceBlendshapes}
              className="h-full"
            />
          </div>

          {/* Engine Status Callout */}
          <div className="p-4 rounded-2xl bg-white dark:bg-dark-card border border-gray-200/80 dark:border-gray-800 shadow-soft flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-brand-teal animate-ping" />
              <p className="font-heading font-bold text-base sm:text-lg text-brand-ink dark:text-white">
                {urgentConfirmPrompt
                  ? '⚠️ HOLD EMERGENCY AGAIN TO CONFIRM'
                  : engineStatusMsg}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Status Cards & Request Chips */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Sent / Acknowledged Banner */}
          <AnimatePresence>
            {sentRequest && (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className={`p-6 rounded-2xl text-white shadow-xl transition-all ${
                  sentRequest.status === 'acked'
                    ? 'bg-emerald-600 shadow-emerald-500/20'
                    : 'bg-brand-teal shadow-brand-teal/20 animate-pulse'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  {sentRequest.status === 'acked' ? (
                    <CheckCircle2 className="w-8 h-8 text-white shrink-0" />
                  ) : (
                    <Clock className="w-8 h-8 text-white shrink-0 animate-spin" />
                  )}
                  <h3 className="text-2xl font-heading font-bold">
                    {sentRequest.status === 'acked'
                      ? 'Help is coming!'
                      : `We told caregiver: ${sentRequest.label}`}
                  </h3>
                </div>

                <p className="text-sm font-medium opacity-95 leading-relaxed">
                  {sentRequest.status === 'acked'
                    ? `${sentRequest.caregiverName || 'Caregiver'} got your message and is on the way!`
                    : 'Your caregiver screen received this request.'}
                </p>

                {sentRequest.quickReply && (
                  <div className="mt-3 p-3 rounded-xl bg-white/20 text-white font-bold text-sm">
                    💬 Quick Note: "{sentRequest.quickReply}"
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Taught Gestures Chips */}
          <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-heading font-bold text-brand-ink dark:text-white">
                Your Taught Movements
              </h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-teal-soft text-brand-teal">
                {profile.gestures.length} Ready
              </span>
            </div>

            {profile.gestures.length === 0 ? (
              <div className="text-center py-6 text-brand-muted dark:text-dark-muted text-xs">
                No gestures taught yet. Click "Teach" in the top bar to set up movements.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {profile.gestures.map((g, idx) => {
                  const isMatching = detectedLabel === g.label;
                  return (
                    <div
                      key={g.id}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                        isMatching
                          ? 'border-brand-teal bg-brand-teal-soft/60 dark:bg-brand-teal/30 scale-[1.02] shadow-md'
                          : 'border-gray-200/60 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-3.5 h-3.5 rounded-full ${
                            g.priority === 'urgent'
                              ? 'bg-red-500'
                              : g.priority === 'important'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                        <span className="font-heading font-bold text-base text-brand-ink dark:text-white">
                          {g.label}
                        </span>
                      </div>

                      <span className="text-xs font-semibold text-brand-muted dark:text-dark-muted flex items-center gap-1">
                        <Keyboard className="w-3.5 h-3.5" /> Key {idx + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* QR Code Phone Sync Section */}
          <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-brand-teal">
              <QrCode className="w-5 h-5" />
              <h4 className="font-heading font-bold text-base text-brand-ink dark:text-white">
                Open Caregiver Screen on Phone
              </h4>
            </div>

            {qrDataUri && (
              <img
                src={qrDataUri}
                alt="Caregiver QR Code"
                className="w-36 h-36 mx-auto rounded-xl border-4 border-gray-100 dark:border-gray-800 shadow-md"
              />
            )}

            <p className="text-xs text-brand-muted dark:text-dark-muted font-mono break-all px-2">
              {caregiverQrUrl}
            </p>

            {candidateIps.length > 1 && (
              <div className="pt-1 space-y-1 text-left">
                <span className="text-[11px] font-bold text-brand-muted block">Switch Laptop Network Adapter:</span>
                <div className="flex flex-wrap gap-1.5">
                  {candidateIps.map((c: any) => (
                    <button
                      key={c.ip}
                      onClick={() => updateQrCode(`http://${c.ip}:5173/caregiver`)}
                      className={`text-[11px] px-2 py-1 rounded-lg border font-mono transition-colors ${
                        caregiverQrUrl.includes(c.ip)
                          ? 'bg-brand-teal text-white border-brand-teal'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-brand-teal'
                      }`}
                    >
                      {c.name} {c.isPreferred ? '⭐' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <a
                href="/caregiver"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-brand-ink dark:text-white text-xs font-bold rounded-xl transition-colors"
              >
                <span>Open Caregiver Screen in New Tab</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <a
                href="/caregiver#doctor"
                className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center justify-center gap-1"
              >
                <span>🩺 Need help connecting? Open Connection Doctor</span>
              </a>
            </div>
          </div>

        </div>

      </div>

      {/* Comfort Watch Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 text-brand-teal flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold font-heading text-center text-brand-ink dark:text-white">
              Enable Comfort Watch?
            </h3>
            <p className="text-xs sm:text-sm text-brand-muted text-center leading-relaxed">
              Comfort Watch checks if your face looks uncomfortable for several seconds and asks a nurse to check on you.
            </p>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs text-brand-muted space-y-1">
              <p>🔒 <strong>Your video stays on this laptop.</strong> No video or photo is ever recorded or sent.</p>
              <p>⏱️ Takes a quick 10-second check of your relaxed face.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConsentModal(false)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-brand-ink dark:text-white text-xs font-bold rounded-xl hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleGrantConsent}
                className="flex-1 py-3 bg-brand-teal text-white text-xs font-bold rounded-xl hover:bg-brand-teal-hover shadow"
              >
                I Agree & Turn On
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10-Second Face Calibration Wizard Modal */}
      {showCalibrateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-4">
            <Smile className="w-16 h-16 text-brand-teal mx-auto animate-pulse" />
            <h3 className="text-2xl font-bold font-heading text-brand-ink dark:text-white">
              Relax Your Face
            </h3>
            <p className="text-sm text-brand-muted">
              Look normally at the camera for 10 seconds. We measure your calm face so alerts are fair to you.
            </p>
            <div className="text-4xl font-extrabold font-mono text-brand-teal py-2">
              {calibrateCountdown}s
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 h-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-teal transition-all duration-1000"
                style={{ width: `${((10 - calibrateCountdown) / 10) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
