import React, { useEffect, useState, useRef } from 'react';
import { CameraView } from '../components/CameraView';
import { extractPoseFeatures } from '../engine/features';
import { normalizeLandmarks } from '../engine/normalize';
import { classifyGesture } from '../engine/knn';
import { DecisionStateMachine } from '../engine/stateMachine';
import { Landmark, UserProfile } from '../engine/types';
import { getStoredProfile } from '../utils/profileStorage';
import { ReachWebSocket } from '../utils/websocket';
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

  // WebSocket reference
  const wsRef = useRef<ReachWebSocket | null>(null);

  // Demo helpers keyboard shortcut toggle
  const [showDemoHelpers, setShowDemoHelpers] = useState<boolean>(true);

  // Load profile and setup WebSocket
  useEffect(() => {
    const prof = getStoredProfile();
    setProfile(prof);
    stateMachineRef.current.updateSettings(prof.settings);

    // Fetch server LAN info for QR Code
    fetch('/api/info')
      .then((res) => res.json())
      .then((data) => {
        const cUrl = data.caregiverUrl || `${window.location.protocol}//${window.location.host}/caregiver`;
        setCaregiverQrUrl(cUrl);
        QRCode.toDataURL(cUrl, { margin: 2, width: 200 })
          .then((uri) => setQrDataUri(uri))
          .catch(console.error);
      })
      .catch(() => {
        const fallbackUrl = `${window.location.protocol}//${window.location.host}/caregiver`;
        setCaregiverQrUrl(fallbackUrl);
        QRCode.toDataURL(fallbackUrl, { margin: 2, width: 200 })
          .then((uri) => setQrDataUri(uri))
          .catch(console.error);
      });

    // Connect WebSocket
    const ws = new ReachWebSocket('patient', prof.name || 'Ravi');
    wsRef.current = ws;
    ws.connect();

    ws.on('connection', (status: boolean) => {
      setWsConnected(status);
    });

    ws.on('presence', (data: any) => {
      setCaregiverCount(data.caregivers || 0);
    });

    ws.on('request:acked', (data: any) => {
      setSentRequest((prev) => {
        if (prev && prev.id === data.id) {
          // Speak text-to-speech if enabled
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

  // Process landmarks on every video frame
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

    // Fire Request when state machine triggers shouldSendRequest
    if (update.shouldSendRequest && update.matchedLabel) {
      const matchedDef = profile.gestures.find((g) => g.label === update.matchedLabel);
      sendGestureRequest(
        update.matchedLabel,
        matchedDef?.priority || 'normal',
        result.confidence
      );
    }
  };

  const sendGestureRequest = (label: string, priority: 'normal' | 'important' | 'urgent', confidence: number) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    const newReq = {
      id: requestId,
      patientId: profile.id,
      patientName: profile.name,
      bed: profile.bed,
      label,
      priority,
      confidence,
      triggeredAt: Date.now(),
    };

    setSentRequest({
      id: requestId,
      label,
      priority,
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

  // Keyboard Shortcuts (1-8) Demo Safety Net
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
  }, [profile]);

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
              : 'Offline - Saving requests locally'}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs sm:text-sm font-medium text-brand-muted dark:text-dark-muted">
          <div className="flex items-center gap-1.5">
            <Wifi className="w-4 h-4 text-brand-teal" />
            <span>Local Network</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-4 h-4 text-brand-teal" />
            <span>Speech Ready</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>100% Private</span>
          </div>
        </div>
      </div>

      {/* Urgent Confirmation Alert Bar */}
      <AnimatePresence>
        {urgentConfirmPrompt && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-red-600 text-white font-heading font-bold text-center text-lg shadow-glow animate-pulse"
          >
            ⚠️ HOLD EMERGENCY GESTURE AGAIN TO CONFIRM!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Camera View */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <CameraView
            onLandmarksDetected={handleLandmarks}
            onFpsUpdate={setFps}
            holdProgress={holdProgress}
            detectedLabel={detectedLabel}
            className="w-full aspect-[4/3] sm:aspect-[16/9]"
          />

          {/* Engine Status Bar */}
          <div className="bg-white dark:bg-dark-card px-5 py-3 rounded-xl border border-gray-200/80 dark:border-gray-800 flex items-center justify-between text-xs sm:text-sm font-medium">
            <span className="text-brand-muted dark:text-dark-muted">Engine Status:</span>
            <span className="font-bold text-brand-teal">{engineStatusMsg}</span>
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

            <a
              href="/caregiver"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-brand-ink dark:text-white text-xs font-bold rounded-xl transition-colors"
            >
              <span>Open Caregiver Screen in New Tab</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

        </div>

      </div>

    </div>
  );
};
