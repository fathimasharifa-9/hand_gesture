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
}

export const CaregiverPage: React.FC = () => {
  const [caregiverName, setCaregiverName] = useState<string>(() => {
    return localStorage.getItem('reach_caregiver_name') || 'Priya';
  });

  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [alertsUnlocked, setAlertsUnlocked] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [nowTime, setNowTime] = useState<number>(Date.now());

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

  // Connect WebSocket
  useEffect(() => {
    const ws = new ReachWebSocket('caregiver', caregiverName);
    wsRef.current = ws;
    ws.connect();

    ws.on('connection', (status: boolean) => {
      setWsConnected(status);
    });

    ws.on('requests:init', (data: any) => {
      if (Array.isArray(data.requests)) {
        setRequests(data.requests);
      }
    });

    ws.on('request:new', (data: any) => {
      const newReq: RequestItem = data.request;
      setRequests((prev) => [newReq, ...prev.filter((r) => r.id !== newReq.id)]);

      // Play chime, vibrate, and speak if alerts unlocked
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

  // Unlock AudioContext & Vibration on user interaction
  const unlockAudio = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
        audioCtxRef.current.resume();
      }
      setAlertsUnlocked(true);
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
    playChime(req.priority);

    // Vibration pattern
    if ('vibrate' in navigator) {
      if (req.priority === 'urgent') {
        navigator.vibrate([500, 150, 500, 150, 500]);
      } else if (req.priority === 'important') {
        navigator.vibrate([200, 100, 200]);
      } else {
        navigator.vibrate([200]);
      }
    }

    // Text to speech
    if (soundEnabled && 'speechSynthesis' in window) {
      const text = `${req.bed || 'Bed'}, ${req.patientName || 'Patient'} needs ${req.label}`;
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
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
      
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Top Header Card */}
        <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft flex flex-wrap items-center justify-between gap-4">
          
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <HeartPulse className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={caregiverName}
                  onChange={(e) => setCaregiverName(e.target.value)}
                  className="font-heading font-extrabold text-2xl bg-transparent border-b border-gray-300 dark:border-gray-700 text-brand-ink dark:text-white focus:outline-none focus:border-brand-teal"
                />
                <span className="text-xs text-brand-muted dark:text-dark-muted">(Tap to edit name)</span>
              </div>
              <p className="text-xs text-brand-muted dark:text-dark-muted">
                Caregiver Station • Phone & Laptop Compatible
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Audio Unlock Button */}
            {!alertsUnlocked && (
              <button
                onClick={unlockAudio}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md animate-bounce"
              >
                <Bell className="w-4 h-4" />
                <span>Tap to Enable Sound & Vibration</span>
              </button>
            )}

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-brand-ink dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Toggle Sound Alerts"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5 text-brand-teal" /> : <VolumeX className="w-5 h-5 text-gray-400" />}
            </button>

            {/* Connection Status Badge */}
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              wsConnected ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>{wsConnected ? 'Live' : 'Connecting...'}</span>
            </div>
          </div>

        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 pb-2">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-5 py-2.5 rounded-xl font-heading font-bold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'live'
                ? 'bg-brand-teal text-white shadow-md'
                : 'text-brand-muted hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <HeartPulse className="w-4 h-4" />
            <span>Live Requests ({sortedLiveRequests.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`px-5 py-2.5 rounded-xl font-heading font-bold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'history'
                ? 'bg-brand-teal text-white shadow-md'
                : 'text-brand-muted hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>History ({historyRequests.length})</span>
          </button>
        </div>

        {/* LIVE REQUESTS TAB */}
        {activeTab === 'live' && (
          <div className="space-y-4">
            {sortedLiveRequests.length === 0 ? (
              <div className="bg-white dark:bg-dark-card p-12 rounded-2xl border border-gray-200/80 dark:border-gray-800 text-center space-y-4 shadow-soft">
                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto opacity-80" />
                <h3 className="text-2xl font-bold font-heading text-brand-ink dark:text-white">
                  All Clear! No Active Requests
                </h3>
                <p className="text-sm text-brand-muted dark:text-dark-muted max-w-sm mx-auto">
                  When a patient holds a gesture on their screen, requests will appear here instantly.
                </p>
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
                    className={`p-6 rounded-2xl border-2 shadow-lg transition-all ${
                      req.priority === 'urgent'
                        ? 'bg-red-500/10 border-red-500 dark:bg-red-950/30'
                        : isEscalated
                        ? 'bg-amber-500/10 border-amber-500 dark:bg-amber-950/30'
                        : 'bg-white dark:bg-dark-card border-gray-200 dark:border-gray-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-2xl text-white ${
                          req.priority === 'urgent'
                            ? 'bg-red-500 shadow-glow'
                            : req.priority === 'important'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}>
                          {req.label === 'Water' ? '💧' : req.label === 'Pain' ? '⚡' : req.label === 'Emergency' ? '🚨' : '✋'}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-3xl font-extrabold font-heading text-brand-ink dark:text-white">
                              {req.label}
                            </h3>
                            <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded-md text-white ${
                              req.priority === 'urgent'
                                ? 'bg-red-600'
                                : req.priority === 'important'
                                ? 'bg-amber-600'
                                : 'bg-emerald-600'
                            }`}>
                              {req.priority}
                            </span>
                          </div>
                          <p className="text-base font-medium text-brand-muted dark:text-dark-muted mt-1">
                            {req.patientName} • {req.bed}
                          </p>
                        </div>
                      </div>

                      {/* Time Ticking & Confidence Badge */}
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 font-mono text-sm font-bold text-brand-teal">
                          <Clock className="w-4 h-4" />
                          <span>{elapsedSec}s ago</span>
                        </div>
                        <span className="text-xs text-brand-muted dark:text-dark-muted block mt-1">
                          How sure: <strong className="text-brand-ink dark:text-white">{Math.round(req.confidence * 100)}%</strong>
                        </span>

                        {isEscalated && (
                          <span className="inline-block mt-2 px-3 py-1 bg-amber-500 text-white font-bold text-xs rounded-full animate-bounce">
                            ⚠️ Still Waiting (&gt;30s)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {req.status === 'new' ? (
                      <div className="space-y-3 pt-2">
                        <button
                          onClick={() => handleAcknowledge(req.id)}
                          className="w-full h-16 bg-brand-teal hover:bg-brand-teal-hover text-white font-extrabold text-xl rounded-xl shadow-lg shadow-brand-teal/25 flex items-center justify-center gap-3 transition-transform hover:scale-[1.01]"
                        >
                          <Check className="w-7 h-7" />
                          <span>ACKNOWLEDGE</span>
                        </button>

                        {/* Quick Replies */}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <span className="text-xs font-bold text-brand-muted self-center mr-1">Quick Note:</span>
                          {['Coming now', '2 minutes', 'Will bring it'].map((reply) => (
                            <button
                              key={reply}
                              onClick={() => handleAcknowledge(req.id, reply)}
                              className="px-3.5 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-brand-teal hover:text-white text-xs font-bold transition-colors"
                            >
                              "{reply}"
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
                        <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5" />
                          <span>Acknowledged by {req.caregiverName} {req.quickReply ? `("${req.quickReply}")` : ''}</span>
                        </div>

                        <button
                          onClick={() => handleResolve(req.id)}
                          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow transition-colors"
                        >
                          Mark Done
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })
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
                  className="p-5 rounded-2xl bg-white dark:bg-dark-card border border-gray-200/80 dark:border-gray-800 shadow-sm flex items-center justify-between"
                >
                  <div>
                    <h4 className="font-heading font-bold text-lg text-brand-ink dark:text-white">
                      {req.label} ({req.patientName} • {req.bed})
                    </h4>
                    <p className="text-xs text-brand-muted">
                      Acked by {req.caregiverName} in {req.ackedAt ? ((req.ackedAt - req.triggeredAt) / 1000).toFixed(1) : 0}s
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
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
