import React, { useEffect, useState, useRef } from 'react';
import { CameraView } from '../components/CameraView';
import { extractPoseFeatures } from '../engine/features';
import { normalizeLandmarks, LandmarkSmoother } from '../engine/normalize';
import { classifyGesture } from '../engine/knn';
import { DecisionStateMachine } from '../engine/stateMachine';
import { Landmark, UserProfile, ClassificationResult } from '../engine/types';
import {
  getAllPatients,
  getActivePatient,
  setActivePatientId,
  getStoredProfile,
} from '../utils/profileStorage';
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
  ShieldAlert,
  Moon,
  Activity,
  HeartHandshake,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const LivePage: React.FC = () => {
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [activePatient, setActivePatient] = useState<UserProfile>(getStoredProfile());
  const [fps, setFps] = useState<number>(0);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [caregiverCount, setCaregiverCount] = useState<number>(0);

  // Gesture Engine State
  const stateMachineRef = useRef<DecisionStateMachine>(
    new DecisionStateMachine(activePatient.settings)
  );
  const smootherRef = useRef<LandmarkSmoother>(new LandmarkSmoother(0.65));

  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [detectedLabel, setDetectedLabel] = useState<string | null>(null);
  const [detectedConfidence, setDetectedConfidence] = useState<number>(0);
  const [detectedMargin, setDetectedMargin] = useState<number>(0);
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
  const [candidateIps, setCandidateIps] = useState<any[]>([]);

  const updateQrCode = (url: string) => {
    setCaregiverQrUrl(url);
    QRCode.toDataURL(url, { margin: 2, width: 200 })
      .then((uri) => setQrDataUri(uri))
      .catch(console.error);
  };

  // WebSocket reference
  const wsRef = useRef<ReachWebSocket | null>(null);

  // Load patients and profile on mount
  useEffect(() => {
    loadPatients();

    // Listen for patient change events
    const onPatientChange = () => {
      loadPatients();
    };
    window.addEventListener('reach:patient-changed', onPatientChange);
    return () => window.removeEventListener('reach:patient-changed', onPatientChange);
  }, []);

  const loadPatients = async () => {
    const list = await getAllPatients();
    setPatients(list);
    const prof = await getActivePatient();
    setActivePatient(prof);
    stateMachineRef.current = new DecisionStateMachine(prof.settings);
  };

  const handleSwitchPatient = (patientId: string) => {
    setActivePatientId(patientId);
    const found = patients.find((p) => p.id === patientId);
    if (found) {
      setActivePatient(found);
      stateMachineRef.current = new DecisionStateMachine(found.settings);
      stateMachineRef.current.reset();
      smootherRef.current.reset();
      setHoldProgress(0);
      setDetectedLabel(null);
      setEngineStatusMsg('Ready for ' + found.name);
    }
  };

  // Connect WebSocket
  useEffect(() => {
    // Fetch server LAN info for QR Code
    fetch('/api/info')
      .then((res) => res.json())
      .then((data) => {
        if (data.candidateIps) setCandidateIps(data.candidateIps);
        const cUrl = data.caregiverUrl || `${window.location.protocol}//${window.location.host}/caregiver`;
        updateQrCode(cUrl);
      })
      .catch(() => {});

    const ws = new ReachWebSocket('patient', activePatient.name);
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
          if (activePatient.settings.speak && 'speechSynthesis' in window) {
            try {
              const replyText = data.quickReply ? ` ${data.quickReply}.` : '';
              const text = `Help is on the way. ${data.caregiverName || 'Nurse'} confirmed.${replyText}`;
              const utterance = new SpeechSynthesisUtterance(text);
              window.speechSynthesis.speak(utterance);
            } catch (e) {}
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
  }, [activePatient.name]);

  // Handle hand landmarks detection
  const handleLandmarksDetected = (landmarks: any) => {
    if (!landmarks || landmarks.length === 0) {
      smootherRef.current.reset();
      const update = stateMachineRef.current.processFrame(null);
      setHoldProgress(update.holdProgress);
      setDetectedLabel(null);
      setDetectedConfidence(0);
      setDetectedMargin(0);
      setEngineStatusMsg(update.statusMessage);
      setUrgentConfirmPrompt(update.needsUrgentConfirm);
      return;
    }

    if (!activePatient.gestures || activePatient.gestures.length === 0) {
      setEngineStatusMsg('No gestures trained yet. Visit Teach page first.');
      return;
    }

    // Apply temporal EMA smoothing to eliminate jitter
    const smoothedRaw = smootherRef.current.smooth(landmarks[0]);

    // Check right hand and left hand normalized coordinates
    const normRight = normalizeLandmarks(smoothedRaw, false, activePatient.settings.ignoreTilt);
    const featRight = extractPoseFeatures(normRight);
    const resRight = classifyGesture(featRight, activePatient.gestures, activePatient.restSamples);

    const normLeft = normalizeLandmarks(smoothedRaw, true, activePatient.settings.ignoreTilt);
    const featLeft = extractPoseFeatures(normLeft);
    const resLeft = classifyGesture(featLeft, activePatient.gestures, activePatient.restSamples);

    // Pick best match between hands
    const bestResult: ClassificationResult = resRight.confidence >= resLeft.confidence ? resRight : resLeft;

    setDetectedConfidence(bestResult.confidence);
    setDetectedMargin(bestResult.margin);

    // Feed result to decision state machine
    const smUpdate = stateMachineRef.current.processFrame(bestResult);

    setHoldProgress(smUpdate.holdProgress);
    setDetectedLabel(smUpdate.matchedLabel);
    setEngineStatusMsg(smUpdate.statusMessage);
    setUrgentConfirmPrompt(smUpdate.needsUrgentConfirm);

    // Send request when hold completes
    if (smUpdate.shouldSendRequest && smUpdate.matchedLabel) {
      sendAssistanceRequest(smUpdate.matchedLabel, bestResult.priority || 'normal', bestResult.confidence);
    }
  };

  // Dispatch assistance request to server
  const sendAssistanceRequest = (
    label: string,
    priority: 'normal' | 'important' | 'urgent',
    confidence: number
  ) => {
    const reqId = `req_${Date.now()}`;
    const newReq = {
      id: reqId,
      patientId: activePatient.id,
      patientName: activePatient.name,
      bed: activePatient.bed,
      assignedCaregiver: activePatient.assignedCaregiver || 'Priya',
      label,
      priority,
      confidence,
      triggeredAt: Date.now(),
      status: 'sent' as const,
    };

    setSentRequest(newReq);

    // Text to speech acknowledgment locally
    if (activePatient.settings.speak && 'speechSynthesis' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(`Requesting ${label}`);
        window.speechSynthesis.speak(utterance);
      } catch (e) {}
    }

    if (wsRef.current) {
      wsRef.current.send({
        type: 'request',
        request: newReq,
      });
    }
  };

  // Keyboard accessibility triggers (1: Water, 2: Pain, 3: Bathroom, 4: Emergency)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === '1') sendAssistanceRequest('Water', 'normal', 1.0);
      else if (e.key === '2') sendAssistanceRequest('Pain', 'urgent', 1.0);
      else if (e.key === '3') sendAssistanceRequest('Bathroom', 'normal', 1.0);
      else if (e.key === '4') sendAssistanceRequest('Emergency', 'urgent', 1.0);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePatient]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Patient Header & Status Bar */}
      <div className="bg-white dark:bg-dark-card p-4 sm:p-5 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft flex flex-wrap items-center justify-between gap-4">
        
        {/* Patient Selector */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-teal/15 text-brand-teal flex items-center justify-center font-bold text-xl">
            {activePatient.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider">Patient:</span>
              <select
                value={activePatient.id}
                onChange={(e) => handleSwitchPatient(e.target.value)}
                className="bg-gray-100 dark:bg-gray-800 text-brand-ink dark:text-white font-heading font-extrabold text-base rounded-lg px-2 py-0.5 border border-gray-300 dark:border-gray-700 outline-none focus:ring-2 focus:ring-brand-teal cursor-pointer"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.bed || 'No Bed'})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-brand-muted mt-0.5">
              {activePatient.bed} • Assigned Caregiver:{' '}
              <span className="font-semibold text-brand-teal">{activePatient.assignedCaregiver || 'Priya'}</span>
            </p>
          </div>
        </div>

        {/* Live Network & Caregiver Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border ${
              wsConnected
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>{wsConnected ? 'Connected to Station' : 'Reconnecting...'}</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 text-xs font-semibold">
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>{caregiverCount} Caregiver Online</span>
          </div>
        </div>
      </div>

      {/* Urgent 2-Step Confirmation Banner */}
      <AnimatePresence>
        {urgentConfirmPrompt && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 rounded-2xl bg-red-600 text-white shadow-xl flex items-center justify-between gap-4 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-7 h-7 shrink-0" />
              <div>
                <h3 className="font-heading font-extrabold text-lg">Emergency Gesture Detected!</h3>
                <p className="text-xs text-red-100 font-medium">
                  Hold the Emergency gesture again for 1 second to confirm sending an urgent emergency alert.
                </p>
              </div>
            </div>
            <span className="text-xs font-black uppercase tracking-wider bg-white/20 px-3 py-1 rounded-full">
              2-Step Safety Active
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Grid: Camera & Live Recognition HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left: Camera Feed */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative">
            <CameraView
              onLandmarksDetected={handleLandmarksDetected}
              onFpsUpdate={setFps}
              holdProgress={holdProgress}
              detectedLabel={detectedLabel}
              className="w-full aspect-[4/3] rounded-3xl"
            />

            {/* In-Video Status Overlay */}
            <div className="absolute bottom-6 left-6 right-6 z-20 flex items-center justify-between pointer-events-none">
              <div className="bg-black/70 backdrop-blur-md px-4 py-2 rounded-2xl text-white border border-white/10 shadow-lg">
                <span className="text-xs font-medium text-gray-300 block">Status:</span>
                <span className="text-sm font-bold text-brand-teal">{engineStatusMsg}</span>
              </div>

              {detectedLabel && (
                <div className="bg-black/80 backdrop-blur-md px-5 py-2.5 rounded-2xl text-white border border-brand-teal/40 shadow-glow">
                  <span className="text-xs font-semibold text-gray-400 block uppercase">Candidate</span>
                  <span className="text-xl font-heading font-extrabold text-brand-teal">{detectedLabel}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Keyboard Shortcuts Bar */}
          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 flex flex-wrap items-center justify-between text-xs text-brand-muted gap-2">
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-brand-teal" />
              <span className="font-semibold text-brand-ink dark:text-white">Keyboard Hotkeys:</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 font-mono text-[11px] font-bold">1: Water</span>
              <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 font-mono text-[11px] font-bold">2: Pain</span>
              <span className="px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-800 font-mono text-[11px] font-bold">3: Bathroom</span>
              <span className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-600 font-mono text-[11px] font-bold">4: Emergency</span>
            </div>
          </div>
        </div>

        {/* Right: Real-time Debug HUD & Active Request Card */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Active Request Alert Card */}
          {sentRequest && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`p-6 rounded-2xl border shadow-lg space-y-3 ${
                sentRequest.status === 'acked'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-ink dark:text-white">
                  Active Request
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    sentRequest.status === 'acked'
                      ? 'bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                      : 'bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200 animate-pulse'
                  }`}
                >
                  {sentRequest.status === 'acked' ? 'Caregiver Confirmed' : 'Waiting for Caregiver'}
                </span>
              </div>

              <div className="text-2xl font-extrabold font-heading text-brand-ink dark:text-white">
                "{sentRequest.label}"
              </div>

              {sentRequest.status === 'acked' ? (
                <div className="p-3 rounded-xl bg-white/70 dark:bg-black/30 border border-emerald-300 dark:border-emerald-700 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{sentRequest.caregiverName || 'Caregiver'} acknowledged</span>
                  </div>
                  {sentRequest.quickReply && (
                    <p className="italic font-medium">"{sentRequest.quickReply}"</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-brand-muted">
                  Alert dispatched to {activePatient.assignedCaregiver || 'caregiver'} station.
                </p>
              )}
            </motion.div>
          )}

          {/* Real-time Recognition HUD */}
          <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl space-y-5 border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Recognition Telemetry
              </span>
              <span className="text-xs font-mono text-emerald-400">{fps} FPS</span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[11px] text-slate-400 uppercase font-semibold">Matched Request:</span>
                <div className="text-2xl font-heading font-black text-brand-teal">
                  {detectedLabel || 'Neutral / Rest'}
                </div>
              </div>

              {/* Confidence Gauge */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-400">Confidence:</span>
                  <span className="text-amber-400 font-bold">{Math.round(detectedConfidence * 100)}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-150 rounded-full"
                    style={{ width: `${Math.round(detectedConfidence * 100)}%` }}
                  />
                </div>
              </div>

              {/* Margin Gauge */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-400">Ambiguity Margin:</span>
                  <span className="text-emerald-400 font-bold">{Math.round(detectedMargin * 100)}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-150 rounded-full"
                    style={{ width: `${Math.min(100, Math.round(detectedMargin * 200))}%` }}
                  />
                </div>
              </div>

              {/* Hold Progress Bar */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-400">Hold Confirmation:</span>
                  <span className="text-brand-teal font-bold">{Math.round(holdProgress * 100)}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-brand-teal transition-all duration-100 rounded-full"
                    style={{ width: `${Math.round(holdProgress * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Caregiver Mobile QR Code Card */}
          <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft text-center space-y-4">
            <div>
              <h3 className="font-heading font-bold text-base text-brand-ink dark:text-white flex items-center justify-center gap-2">
                <QrCode className="w-5 h-5 text-brand-teal" />
                <span>Caregiver Phone Station</span>
              </h3>
              <p className="text-xs text-brand-muted mt-0.5">
                Scan with phone camera on hospital Wi-Fi
              </p>
            </div>

            {qrDataUri ? (
              <div className="inline-block p-3 bg-white rounded-2xl shadow-md border border-gray-200">
                <img src={qrDataUri} alt="Caregiver QR" className="w-40 h-40 mx-auto" />
              </div>
            ) : (
              <div className="w-40 h-40 bg-gray-100 rounded-2xl mx-auto flex items-center justify-center text-xs text-gray-400">
                Loading QR...
              </div>
            )}

            <div className="text-left bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800 space-y-1">
              <span className="text-[10px] font-bold uppercase text-brand-muted block">Direct Phone URL:</span>
              <a
                href={caregiverQrUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono font-bold text-brand-teal hover:underline break-all block"
              >
                {caregiverQrUrl}
              </a>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
