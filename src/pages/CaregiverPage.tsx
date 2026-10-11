import React, { useEffect, useState, useRef } from 'react';
import { ReachWebSocket } from '../utils/websocket';
import {
  HeartPulse,
  Volume2,
  VolumeX,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
  Bell,
  Sparkles,
  User,
  History,
  Check,
  Activity,
  Wifi,
  Smartphone,
  Sun,
  Moon,
  RefreshCw,
  Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RequestItem {
  id: string;
  patientId: string;
  patientName: string;
  bed: string;
  label: string;
  priority: 'normal' | 'important' | 'urgent';
  confidence: number;
  triggeredAt: number;
  receivedAt: number;
  ackedAt?: number;
  resolvedAt?: number;
  caregiverName?: string;
  quickReply?: string;
  status: 'new' | 'acked' | 'resolved';
  source?: 'hand' | 'face';
  score?: number;
  durationSec?: number;
  signals?: { brow: boolean; squint: boolean; nose: boolean; close: boolean };
  history?: number[];
  level?: 1 | 2;
  faceAgrees?: boolean;
  verdict?: 'needed_care' | 'false_alarm';
}

interface CandidateIp {
  name: string;
  ip: string;
  type: string;
  isPreferred: boolean;
}

export const CaregiverPage: React.FC = () => {
  const [caregiverName, setCaregiverName] = useState<string>(() => {
    return localStorage.getItem('reach_caregiver_name') || 'Priya';
  });

  const [activeTab, setActiveTab] = useState<'live' | 'history' | 'doctor'>('live');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [muteThisDevice, setMuteThisDevice] = useState<boolean>(() => {
    return localStorage.getItem('reach_mute_laptop_caregiver') === 'true';
  });
  const [alertsUnlocked, setAlertsUnlocked] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [wsLatency, setWsLatency] = useState<number>(0);
  const [wsError, setWsError] = useState<string | null>(null);

  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [nowTime, setNowTime] = useState<number>(Date.now());

  // Wake lock state
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const wakeLockSentinelRef = useRef<any>(null);

  // Connection Doctor state
  const [serverAddressInput, setServerAddressInput] = useState<string>(() => {
    return localStorage.getItem('reach_custom_server') || (typeof window !== 'undefined' ? `${window.location.hostname}:3000` : 'localhost:3000');
  });
  const [reachabilityStatus, setReachabilityStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
  const [reachabilityLatency, setReachabilityLatency] = useState<number>(0);
  const [candidateIps, setCandidateIps] = useState<CandidateIp[]>([]);
  const [testRequestSent, setTestRequestSent] = useState<boolean>(false);

  const wsRef = useRef<ReachWebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Live timer tick for "12s ago" timestamps & 30s escalation
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Save caregiver name change
  useEffect(() => {
    localStorage.setItem('reach_caregiver_name', caregiverName);
  }, [caregiverName]);

  // Fetch server candidate IPs on load
  useEffect(() => {
    fetch('/api/info')
      .then((res) => res.json())
      .then((data) => {
        if (data.candidateIps) {
          setCandidateIps(data.candidateIps);
        }
      })
      .catch(() => {});
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const ws = new ReachWebSocket('caregiver', caregiverName);
    wsRef.current = ws;
    ws.connect();

    ws.on('connection', (status: boolean) => {
      setWsConnected(status);
      setWsError(ws.lastError);
    });

    ws.on('heartbeat', (data: any) => {
      setWsLatency(data.latencyMs || 0);
    });

    ws.on('requests:init', (data: any) => {
      if (Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
    });

    ws.on('request:new', (data: any) => {
      const newReq: RequestItem = data.request;
      setRequests((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)]);
      triggerAlertEffects(newReq);
    });

    ws.on('request:acked', (data: any) => {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === data.id
            ? { ...r, status: 'acked', ackedAt: Date.now(), caregiverName: data.caregiverName, quickReply: data.quickReply }
            : r
        )
      );
    });

    ws.on('request:resolved', (data: any) => {
      setRequests((prev) =>
        prev.map((r) => (r.id === data.id ? { ...r, status: 'resolved', resolvedAt: Date.now() } : r))
      );
    });

    return () => {
      ws.disconnect();
    };
  }, [caregiverName]);

  // Screen Wake Lock API
  const toggleWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        if (!wakeLockActive) {
          const sentinel = await (navigator as any).wakeLock.request('screen');
          wakeLockSentinelRef.current = sentinel;
          setWakeLockActive(true);
          sentinel.addEventListener('release', () => {
            setWakeLockActive(false);
          });
        } else {
          if (wakeLockSentinelRef.current) {
            await wakeLockSentinelRef.current.release();
            wakeLockSentinelRef.current = null;
          }
          setWakeLockActive(false);
        }
      } catch (err) {
        console.warn('Wake Lock error:', err);
      }
    } else {
      alert('Screen Wake Lock is not supported on this browser.');
    }
  };

  // Unlock AudioContext & Vibration on user interaction
  const unlockAudio = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
        audioCtxRef.current.resume();
      }
      setAlertsUnlocked(true);
      playChime('normal');
      if ('vibrate' in navigator) {
        navigator.vibrate(200);
      }
    } catch (err) {
      console.error('Audio unlock failed:', err);
    }
  };

  // Synthesize Chime Sound using Web Audio API
  const playChime = (priority: 'normal' | 'important' | 'urgent') => {
    if (!soundEnabled || !audioCtxRef.current) return;
    try {
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = priority === 'urgent' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(priority === 'urgent' ? 880 : 587.33, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {
      console.error('Chime play error:', e);
    }
  };

  // Mobile Vibration & Speech
  const triggerAlertEffects = (req: RequestItem) => {
    // If laptop is muted so only phone alerts the caregiver
    if (muteThisDevice) return;

    playChime(req.priority);

    // Vibration pattern
    if ('vibrate' in navigator) {
      try {
        if (req.priority === 'urgent') {
          navigator.vibrate([500, 150, 500, 150, 500]);
        } else if (req.priority === 'important') {
          navigator.vibrate([200, 100, 200]);
        } else {
          navigator.vibrate([200]);
        }
      } catch (e) {}
    }

    // Text to speech
    if (soundEnabled && 'speechSynthesis' in window) {
      try {
        const text = `${req.bed || 'Bed'}, ${req.patientName || 'Patient'} needs ${req.label}`;
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
      } catch (e) {}
    }
  };

  // Action: Acknowledge request
  const handleAcknowledge = (id: string, quickReply?: string) => {
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: 'acked', ackedAt: Date.now(), caregiverName, quickReply } : r
      )
    );

    if (wsRef.current) {
      wsRef.current.send({
        type: 'ack',
        id,
        caregiverName,
        quickReply,
      });
    }
  };

  // Action: Feedback for Distress Watch
  const handleFeedback = (id: string, verdict: 'needed_care' | 'false_alarm') => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, verdict } : r))
    );

    if (wsRef.current) {
      wsRef.current.send({
        type: 'feedback',
        id,
        verdict,
      } as any);
    }
  };

  // Action: Resolve request
  const handleResolve = (id: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'resolved', resolvedAt: Date.now() } : r))
    );

    if (wsRef.current) {
      wsRef.current.send({
        type: 'resolve',
        id,
      });
    }
  };

  // Test Server Reachability
  const testServerReachability = async () => {
    setReachabilityStatus('testing');
    const start = performance.now();
    try {
      const cleanHost = serverAddressInput.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const testUrl = `http://${cleanHost}/api/info`;
      const res = await fetch(testUrl, { signal: AbortSignal.timeout(4000) });
      const latency = Math.round(performance.now() - start);
      setReachabilityLatency(latency);
      if (res.ok) {
        setReachabilityStatus('success');
      } else {
        setReachabilityStatus('failed');
      }
    } catch (err) {
      setReachabilityStatus('failed');
    }
  };

  // Save Custom Server Address and Reconnect
  const handleSaveCustomServer = () => {
    if (wsRef.current) {
      wsRef.current.setCustomServer(serverAddressInput);
    }
    testServerReachability();
  };

  // Send Diagnostic Test Request
  const handleSendTestRequest = async () => {
    setTestRequestSent(true);
    try {
      const cleanHost = serverAddressInput.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      await fetch(`http://${cleanHost}/api/test-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName: 'Phone Doctor Test',
          bed: 'Diagnostic',
          label: 'Connection Test OK',
        }),
      });
    } catch (err) {
      // Fallback: send via WebSocket if HTTP blocked
      if (wsRef.current) {
        wsRef.current.send({
          type: 'request',
          request: {
            id: `test_${Date.now()}`,
            patientId: 'patient_test',
            patientName: 'Phone Doctor Test',
            bed: 'Diagnostic',
            label: 'Connection Test OK',
            priority: 'normal',
            confidence: 1.0,
            triggeredAt: Date.now(),
          },
        });
      }
    }
    setTimeout(() => setTestRequestSent(false), 3000);
  };

  // Filter requests for live vs history
  const liveRequests = requests.filter((r) => r.status !== 'resolved');
  const historyRequests = requests.filter((r) => r.status === 'resolved');

  // Sort live requests: Urgent first, then oldest first
  const sortedLiveRequests = [...liveRequests].sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1;
    return a.triggeredAt - b.triggeredAt;
  });

  const hasUrgentUnacked = liveRequests.some((r) => r.priority === 'urgent' && r.status === 'new');

  return (
    <div className={`min-h-[calc(100vh-5rem)] ${hasUrgentUnacked ? 'ring-8 ring-red-500 ring-inset animate-pulse' : ''}`}>
      
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        
        {/* Enable Sound & Vibration Banner for Phone */}
        {!alertsUnlocked && (
          <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 sm:p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <Bell className="w-7 h-7 shrink-0" />
              <div>
                <h4 className="font-heading font-extrabold text-base sm:text-lg">Tap to Enable Sound & Vibration</h4>
                <p className="text-xs sm:text-sm text-amber-100">Phones require a screen tap before playing sounds or buzzing.</p>
              </div>
            </div>
            <button
              onClick={unlockAudio}
              className="w-full sm:w-auto h-12 sm:h-14 px-6 bg-white text-amber-700 font-extrabold text-sm sm:text-base rounded-xl shadow-md hover:bg-amber-50 transition-all shrink-0"
            >
              Enable Alerts Now
            </button>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-white dark:bg-dark-card p-4 sm:p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft flex flex-wrap items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <HeartPulse className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={caregiverName}
                  onChange={(e) => setCaregiverName(e.target.value)}
                  className="font-heading font-extrabold text-xl sm:text-2xl bg-transparent border-b border-gray-300 dark:border-gray-700 text-brand-ink dark:text-white focus:outline-none focus:border-brand-teal max-w-[160px] sm:max-w-none"
                />
                <span className="text-[10px] sm:text-xs text-brand-muted dark:text-dark-muted">(Tap to edit)</span>
              </div>
              <p className="text-xs text-brand-muted dark:text-dark-muted">
                Caregiver Station • Phone & Laptop Compatible
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Mute Laptop (Phone Alerts Only) Toggle */}
            <button
              onClick={() => {
                const next = !muteThisDevice;
                setMuteThisDevice(next);
                localStorage.setItem('reach_mute_laptop_caregiver', String(next));
              }}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                muteThisDevice
                  ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300'
              }`}
              title="Mutes buzzes & sounds on this device so notifications go only to your phone"
            >
              <Smartphone className="w-3.5 h-3.5 text-brand-teal" />
              <span>{muteThisDevice ? 'Alerts on Phone Only 🔕' : 'Alert Laptop + Phone'}</span>
            </button>

            {/* Screen Wake Lock Toggle */}
            <button
              onClick={toggleWakeLock}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                wakeLockActive
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300'
              }`}
              title="Keeps the phone screen awake while watching for requests"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{wakeLockActive ? 'Screen Awake: ON' : 'Keep Screen Awake'}</span>
            </button>

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2 sm:p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-brand-ink dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Toggle Sound Alerts"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-brand-teal" /> : <VolumeX className="w-5 h-5 text-gray-400" />}
            </button>

            {/* Connection Status Badge */}
            <button
              onClick={() => setActiveTab('doctor')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:opacity-90 transition-opacity ${
                wsConnected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 animate-pulse'
              }`}
              title="Click to open Connection Doctor"
            >
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span>{wsConnected ? `Live (${wsLatency}ms)` : 'Offline ⚠️'}</span>
            </button>
          </div>

        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 sm:gap-3 border-b border-gray-200 dark:border-gray-800 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-heading font-bold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap transition-all ${
              activeTab === 'live'
                ? 'bg-brand-teal text-white shadow-md'
                : 'text-brand-muted hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <HeartPulse className="w-4 h-4" />
            <span>Live Calls ({sortedLiveRequests.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-heading font-bold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap transition-all ${
              activeTab === 'history'
                ? 'bg-brand-teal text-white shadow-md'
                : 'text-brand-muted hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>History ({historyRequests.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('doctor')}
            className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-heading font-bold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap transition-all ${
              activeTab === 'doctor'
                ? 'bg-brand-teal text-white shadow-md'
                : 'text-brand-muted hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <Activity className="w-4 h-4 text-amber-500" />
            <span>Connection Doctor 🩺</span>
          </button>
        </div>

        {/* LIVE REQUESTS TAB */}
        {activeTab === 'live' && (
          <div className="space-y-4">
            {sortedLiveRequests.length === 0 ? (
              <div className="bg-white dark:bg-dark-card p-8 sm:p-12 rounded-2xl border border-gray-200/80 dark:border-gray-800 text-center space-y-4 shadow-soft">
                <CheckCircle2 className="w-14 h-14 sm:w-16 sm:h-16 text-emerald-500 mx-auto opacity-80" />
                <h3 className="text-xl sm:text-2xl font-bold font-heading text-brand-ink dark:text-white">
                  All Clear! No Active Requests
                </h3>
                <p className="text-xs sm:text-sm text-brand-muted dark:text-dark-muted max-w-sm mx-auto">
                  When a patient holds a gesture on their screen, requests will appear here instantly.
                </p>
                <button
                  onClick={handleSendTestRequest}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send a Test Help Request</span>
                </button>
              </div>
            ) : (
              sortedLiveRequests.map((req) => {
                const elapsedSec = Math.floor((nowTime - req.triggeredAt) / 1000);
                const isEscalated = req.status === 'new' && elapsedSec >= 30;

                return (
                  <motion.div
                    key={req.id}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`p-5 sm:p-6 rounded-2xl border-2 shadow-lg transition-all ${
                      req.priority === 'urgent'
                        ? 'bg-red-500/10 border-red-500 dark:bg-red-950/30'
                        : isEscalated
                        ? 'bg-amber-500/10 border-amber-500 dark:bg-amber-950/30'
                        : 'bg-white dark:bg-dark-card border-gray-200 dark:border-gray-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-bold text-2xl sm:text-3xl text-white shrink-0 ${
                          req.priority === 'urgent'
                            ? 'bg-red-500 shadow-glow'
                            : req.priority === 'important'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}>
                          {req.source === 'face'
                            ? req.level === 2 ? '🚨' : '🛡️'
                            : req.label === 'Water' ? '💧' : req.label === 'Pain' ? '⚡' : req.label === 'Emergency' ? '🚨' : req.label === 'Move me' ? '🛋️' : '✋'}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-2xl sm:text-3xl font-extrabold font-heading text-brand-ink dark:text-white">
                              {req.source === 'face' ? (req.level === 2 ? 'Needs a check now' : 'May need a check') : req.label}
                            </h3>
                            <span className={`text-[10px] sm:text-xs font-bold uppercase px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-white ${
                              req.priority === 'urgent'
                                ? 'bg-red-600'
                                : req.priority === 'important'
                                ? 'bg-amber-600'
                                : 'bg-emerald-600'
                            }`}>
                              {req.priority}
                            </span>

                            {req.faceAgrees && (
                              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 animate-pulse">
                                ⚡ Face signal agrees
                              </span>
                            )}
                          </div>
                          <p className="text-sm sm:text-base font-medium text-brand-muted dark:text-dark-muted mt-1">
                            {req.patientName} • {req.bed} {req.source === 'face' ? '• Comfort watch signal' : ''}
                          </p>
                        </div>
                      </div>

                      {/* Time Ticking & Confidence/Signal Strength Badge */}
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 font-mono text-sm font-bold text-brand-teal">
                          <Clock className="w-4 h-4" />
                          <span>{elapsedSec}s ago</span>
                        </div>
                        <span className="text-xs text-brand-muted dark:text-dark-muted block mt-1">
                          {req.source === 'face'
                            ? `Signal strength: ${Math.round((req.score || 0.5) * 100)}%`
                            : `How sure: ${Math.round(req.confidence * 100)}%`}
                        </span>

                        {isEscalated && (
                          <span className="inline-block mt-2 px-3 py-1 bg-amber-500 text-white font-bold text-xs rounded-full animate-bounce">
                            ⚠️ Still Waiting (&gt;30s)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Distress Watch Details: Signal Bar, Chips, Sparkline */}
                    {req.source === 'face' && (
                      <div className="my-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-brand-muted">Signal Strength:</span>
                          <span className="font-bold text-brand-ink dark:text-white">{Math.round((req.score || 0.5) * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              req.priority === 'urgent' ? 'bg-red-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.round((req.score || 0.5) * 100)}%` }}
                          />
                        </div>

                        {/* Signal Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[11px] font-bold text-brand-muted mr-1">Raised:</span>
                          {req.signals?.brow && <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">Brow</span>}
                          {req.signals?.squint && <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">Eyes Squint</span>}
                          {req.signals?.nose && <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">Nose</span>}
                          {req.signals?.close && <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">Eyes Closed</span>}
                        </div>

                        {/* 60s Score Sparkline (Numbers only • No video/photos) */}
                        {Array.isArray(req.history) && req.history.length > 0 && (
                          <div className="pt-1">
                            <span className="text-[10px] text-brand-muted block mb-1">60s Trend (Score data only • No video):</span>
                            <svg className="w-full h-8 overflow-visible" viewBox="0 0 300 32">
                              <polyline
                                fill="none"
                                stroke="#0E9F9A"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                points={req.history.map((val, idx) => `${(idx / 59) * 300},${32 - Math.min(30, val * 30)}`).join(' ')}
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action Buttons: Min 64px tall for easy phone tapping */}
                    {req.status === 'new' ? (
                      <div className="space-y-3 pt-2">
                        <button
                          onClick={() => handleAcknowledge(req.id)}
                          className="w-full h-16 bg-brand-teal hover:bg-brand-teal-hover active:scale-[0.98] text-white font-extrabold text-xl sm:text-2xl rounded-2xl shadow-lg shadow-brand-teal/25 flex items-center justify-center gap-3 transition-transform"
                        >
                          <Check className="w-8 h-8" />
                          <span>ACKNOWLEDGE</span>
                        </button>

                        {/* Quick Replies */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <span className="text-xs font-bold text-brand-muted self-center mr-1">Quick Note:</span>
                          {['Coming now', '2 minutes', 'Will bring it'].map((reply) => (
                            <button
                              key={reply}
                              onClick={() => handleAcknowledge(req.id, reply)}
                              className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-brand-teal hover:text-white active:scale-95 text-xs font-bold transition-all"
                            >
                              "{reply}"
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                            <span>Acknowledged by {req.caregiverName} {req.quickReply ? `("${req.quickReply}")` : ''}</span>
                          </div>

                          <button
                            onClick={() => handleResolve(req.id)}
                            className="w-full sm:w-auto h-12 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow transition-colors"
                          >
                            Mark Done
                          </button>
                        </div>

                        {/* Nurse Feedback Loop for Distress Watch */}
                        {req.source === 'face' && (
                          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-brand-muted">Caregiver Verdict:</span>
                            {!req.verdict ? (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleFeedback(req.id, 'needed_care')}
                                  className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-xs rounded-lg transition-colors"
                                >
                                  ✅ Needed Care
                                </button>
                                <button
                                  onClick={() => handleFeedback(req.id, 'false_alarm')}
                                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs rounded-lg transition-colors"
                                >
                                  ⚠️ False Alarm
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-xs font-bold">
                                <span className={req.verdict === 'false_alarm' ? 'text-amber-600' : 'text-emerald-600'}>
                                  {req.verdict === 'false_alarm' ? '⚠️ Marked False Alarm (Sensitivity reduced)' : '✅ Marked Needed Care (Sensitivity increased)'}
                                </span>
                                <button
                                  onClick={() => handleFeedback(req.id, req.verdict === 'false_alarm' ? 'needed_care' : 'false_alarm')}
                                  className="text-xs text-brand-teal underline"
                                >
                                  Change
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        )}

        {/* CONNECTION DOCTOR TAB */}
        {activeTab === 'doctor' && (
          <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 text-brand-teal flex items-center justify-center shrink-0">
                <Activity className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-heading text-brand-ink dark:text-white">
                  Connection Doctor
                </h3>
                <p className="text-xs text-brand-muted">
                  Diagnose phone-to-laptop connectivity, test reachability, and change IP address.
                </p>
              </div>
            </div>

            {/* Server Address Override */}
            <div className="space-y-3">
              <label className="block text-sm font-bold text-brand-ink dark:text-white">
                Server Address (Laptop Wi-Fi IP and Port)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={serverAddressInput}
                  onChange={(e) => setServerAddressInput(e.target.value)}
                  placeholder="e.g. 10.132.241.116:3000"
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-mono focus:ring-2 focus:ring-brand-teal outline-none"
                />
                <button
                  onClick={handleSaveCustomServer}
                  className="h-12 px-6 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold text-xs rounded-xl shadow transition-colors shrink-0"
                >
                  Save & Reconnect
                </button>
              </div>
              <p className="text-xs text-brand-muted">
                If the phone was loaded with an incorrect IP, type your laptop's Wi-Fi IP above and click Save.
              </p>
            </div>

            {/* Diagnostic Checks Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Check 1: Reachability (HTTP /api/info) */}
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-brand-muted">1. HTTP Reachability</span>
                  <button
                    onClick={testServerReachability}
                    className="text-xs font-bold text-brand-teal hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" /> Test
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${
                    reachabilityStatus === 'success' ? 'bg-emerald-500' : reachabilityStatus === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <span className="font-heading font-bold text-sm">
                    {reachabilityStatus === 'success'
                      ? `Reachable (${reachabilityLatency}ms)`
                      : reachabilityStatus === 'failed'
                      ? 'Unreachable ❌'
                      : reachabilityStatus === 'testing'
                      ? 'Testing...'
                      : 'Not Tested Yet'}
                  </span>
                </div>
                <p className="text-[11px] text-brand-muted">Tests if the phone can talk to the laptop's Web API.</p>
              </div>

              {/* Check 2: WebSocket State */}
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-brand-muted">2. Live WebSocket Channel</span>
                  <span className="text-[10px] text-brand-muted">Ping: {wsLatency}ms</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className="font-heading font-bold text-sm">
                    {wsConnected ? 'Connected & Alive' : 'Disconnected ⚠️'}
                  </span>
                </div>
                <p className="text-[11px] text-brand-muted">
                  {wsConnected ? 'Heartbeat ping running every 10 seconds.' : wsError || 'Check Wi-Fi and firewall settings.'}
                </p>
              </div>

            </div>

            {/* Test Request Button */}
            <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-heading font-bold text-base">3. Send End-to-End Test Request</h4>
                  <p className="text-xs text-gray-400">Proves that a message travels Phone → Server → Caregiver Station.</p>
                </div>
                <button
                  onClick={handleSendTestRequest}
                  className="px-5 py-3 bg-brand-teal hover:bg-brand-teal-hover active:scale-95 text-white font-bold text-xs rounded-xl shadow flex items-center gap-2 transition-transform"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Test Call</span>
                </button>
              </div>
              {testRequestSent && (
                <div className="p-2.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold">
                  ✅ Test call triggered! Check the "Live Calls" tab to see it appear.
                </div>
              )}
            </div>

            {/* Candidate Laptop IPs */}
            {candidateIps.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase text-brand-muted">Detected Laptop IP Candidates:</h4>
                <div className="flex flex-wrap gap-2">
                  {candidateIps.map((c) => (
                    <button
                      key={c.ip}
                      onClick={() => {
                        setServerAddressInput(`${c.ip}:3000`);
                        handleSaveCustomServer();
                      }}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-brand-teal hover:text-white text-xs font-mono transition-colors border border-gray-200 dark:border-gray-700"
                    >
                      {c.name}: {c.ip} {c.isPreferred ? '⭐' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <a
                href="/api/requests.csv"
                download="reach_requests_history.csv"
                className="px-4 py-2.5 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow"
              >
                <Download className="w-4 h-4" />
                <span>Download History CSV</span>
              </a>
            </div>

            {historyRequests.length === 0 ? (
              <div className="bg-white dark:bg-dark-card p-8 rounded-2xl border border-gray-200/80 dark:border-gray-800 text-center text-brand-muted">
                No past resolved requests in history yet.
              </div>
            ) : (
              historyRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-dark-card border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center justify-between gap-4"
                >
                  <div>
                    <h4 className="font-heading font-bold text-base sm:text-lg text-brand-ink dark:text-white">
                      {req.label} ({req.patientName} • {req.bed})
                    </h4>
                    <p className="text-xs text-brand-muted">
                      Acked by {req.caregiverName} in {req.ackedAt ? ((req.ackedAt - req.triggeredAt) / 1000).toFixed(1) : 0}s
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 shrink-0">
                    Resolved
                  </span>
                </div>
              ))
            )}
          </div>
        )}

      </div>
    </div>
  );
};
