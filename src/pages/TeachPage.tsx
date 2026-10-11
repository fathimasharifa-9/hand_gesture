import React, { useState, useEffect, useRef } from 'react';
import { CameraView } from '../components/CameraView';
import { extractPoseFeatures } from '../engine/features';
import { normalizeLandmarks } from '../engine/normalize';
import { classifyGesture } from '../engine/knn';
import { analyzeGestureProfile } from '../engine/coach';
import { GestureDefinition, PriorityLevel, UserProfile, Landmark } from '../engine/types';
import { getStoredProfile, saveProfile } from '../utils/profileStorage';
import {
  Hand,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Clock,
  User,
  ShieldCheck,
  ScatterChart,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PRESET_REQUESTS = [
  { id: 'water', label: 'Water', priority: 'normal' as PriorityLevel, icon: '💧' },
  { id: 'pain', label: 'Pain', priority: 'urgent' as PriorityLevel, icon: '⚡' },
  { id: 'bathroom', label: 'Bathroom', priority: 'normal' as PriorityLevel, icon: '🚻' },
  { id: 'move', label: 'Move me', priority: 'important' as PriorityLevel, icon: '🛋️' },
  { id: 'emergency', label: 'Emergency', priority: 'urgent' as PriorityLevel, icon: '🚨' },
  { id: 'food', label: 'Food', priority: 'normal' as PriorityLevel, icon: '🍲' },
];

export const TeachPage: React.FC = () => {
  const [step, setStep] = useState<number>(1);
  const [patientName, setPatientName] = useState<string>('Ravi');
  const [patientBed, setPatientBed] = useState<string>('Bed 4');

  // Chosen requests
  const [selectedRequests, setSelectedRequests] = useState<
    { id: 'custom' | string; label: string; priority: PriorityLevel }[]
  >([
    { id: 'water', label: 'Water', priority: 'normal' },
    { id: 'pain', label: 'Pain', priority: 'urgent' },
    { id: 'bathroom', label: 'Bathroom', priority: 'normal' },
  ]);

  const [customLabel, setCustomLabel] = useState<string>('');
  const [customPriority, setCustomPriority] = useState<PriorityLevel>('normal');

  // Teaching recording state
  const [currentGestureIndex, setCurrentGestureIndex] = useState<number>(0);
  const [gestureKind, setGestureKind] = useState<'pose' | 'move'>('pose');
  const [recordingState, setRecordingState] = useState<
    'IDLE' | 'COUNTDOWN' | 'RECORDING' | 'RELAX' | 'DONE'
  >('IDLE');
  const [countdown, setCountdown] = useState<number>(3);
  const [round, setRound] = useState<number>(1); // 3 rounds for pose
  const [collectedSamples, setCollectedSamples] = useState<number[][]>([]);
  const [taughtGestures, setTaughtGestures] = useState<GestureDefinition[]>([]);
  const [restSamples, setRestSamples] = useState<number[][]>([]);

  // Timer: "Time to teach"
  const [teachTimeSeconds, setTeachTimeSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Live landmarks ref
  const currentLandmarksRef = useRef<Landmark[] | null>(null);

  // Test screen live feedback
  const [testResult, setTestResult] = useState<{ label: string | null; confidence: number } | null>(null);

  // Load existing profile on mount
  useEffect(() => {
    const prof = getStoredProfile();
    setPatientName(prof.name || 'Ravi');
    setPatientBed(prof.bed || 'Bed 4');
    if (prof.gestures.length > 0) {
      setTaughtGestures(prof.gestures);
      setRestSamples(prof.restSamples || []);
    }
  }, []);

  // Timer counter
  useEffect(() => {
    let timer: any;
    if (isTimerRunning) {
      timer = setInterval(() => {
        setTeachTimeSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isTimerRunning]);

  const handleLandmarks = (landmarks: any) => {
    if (!landmarks || landmarks.length === 0) {
      currentLandmarksRef.current = null;
      return;
    }
    // Track primary hand for teaching
    currentLandmarksRef.current = landmarks[0];

    // If in test step (Step 5), run live classification across all visible hands
    if (step === 5 && taughtGestures.length > 0) {
      let bestRes: any = null;
      let maxConf = -1;

      for (let i = 0; i < landmarks.length; i++) {
        const raw = landmarks[i];
        if (!raw || raw.length < 21) continue;

        const norm1 = normalizeLandmarks(raw, false, true);
        const feat1 = extractPoseFeatures(norm1);
        const res1 = classifyGesture(feat1, taughtGestures, restSamples);

        const norm2 = normalizeLandmarks(raw, true, true);
        const feat2 = extractPoseFeatures(norm2);
        const res2 = classifyGesture(feat2, taughtGestures, restSamples);

        const cand = res1.confidence >= res2.confidence ? res1 : res2;
        if (!cand.isRest && cand.label && cand.confidence > maxConf) {
          maxConf = cand.confidence;
          bestRes = cand;
        } else if (!bestRes) {
          bestRes = cand;
        }
      }

      setTestResult({
        label: bestRes?.label || null,
        confidence: bestRes?.confidence || 0,
      });
    }
  };

  // Start recording flow for current gesture
  const startRecordingCurrentGesture = () => {
    setRecordingState('COUNTDOWN');
    setCountdown(3);
    setCollectedSamples([]);
    setRound(1);
    if (!isTimerRunning) setIsTimerRunning(true);

    let cd = 3;
    const interval = setInterval(() => {
      cd--;
      setCountdown(cd);
      if (cd <= 0) {
        clearInterval(interval);
        setRecordingState('RECORDING');
        captureSamplesLoop(1, []);
      }
    }, 1000);
  };

  const captureSamplesLoop = (currentRound: number, accumulated: number[][]) => {
    let samplesCaptured = 0;
    const roundSamples: number[][] = [];

    const interval = setInterval(() => {
      if (currentLandmarksRef.current) {
        const normalized = normalizeLandmarks(currentLandmarksRef.current);
        const features = extractPoseFeatures(normalized);
        roundSamples.push(features);
        samplesCaptured++;
      }

      if (samplesCaptured >= 10) {
        clearInterval(interval);
        const combined = [...accumulated, ...roundSamples];
        setCollectedSamples(combined);

        if (currentRound < 3) {
          setRecordingState('RELAX');
          setTimeout(() => {
            setRound(currentRound + 1);
            setRecordingState('RECORDING');
            captureSamplesLoop(currentRound + 1, combined);
          }, 1500); // 1.5s relax interval
        } else {
          setRecordingState('DONE');
          // Save completed gesture
          const currentReq = selectedRequests[currentGestureIndex];
          const newDef: GestureDefinition = {
            id: `g_${Date.now()}_${currentReq.id}`,
            label: currentReq.label,
            priority: currentReq.priority,
            kind: gestureKind,
            samples: combined,
            createdAt: Date.now(),
          };

          setTaughtGestures((prev) => {
            const updated = [...prev.filter((g) => g.label !== currentReq.label), newDef];
            return updated;
          });
        }
      }
    }, 120); // Capture sample every 120ms
  };

  // Rest Hand Recording
  const startRestRecording = () => {
    setRecordingState('RECORDING');
    const restAcc: number[][] = [];
    let count = 0;

    const interval = setInterval(() => {
      if (currentLandmarksRef.current) {
        const normalized = normalizeLandmarks(currentLandmarksRef.current);
        const features = extractPoseFeatures(normalized);
        restAcc.push(features);
        count++;
      }

      if (count >= 30) { // ~3.5 seconds of rest hand samples
        clearInterval(interval);
        setRestSamples(restAcc);
        setRecordingState('DONE');
      }
    }, 120);
  };

  const saveFinalProfile = async () => {
    setIsTimerRunning(false);
    const profileToSave: UserProfile = {
      id: 'patient_1',
      name: patientName,
      bed: patientBed,
      gestures: taughtGestures,
      restSamples,
      settings: {
        holdMs: 1200,
        minConfidence: 0.75,
        minMargin: 0.15,
        cooldownMs: 5000,
        ignoreTilt: true,
        twoStepUrgent: true,
        speak: true,
        largeText: false,
      },
      updatedAt: Date.now(),
    };

    await saveProfile(profileToSave);
  };

  // Analyze coach feedback
  const coachAnalysis = analyzeGestureProfile(taughtGestures, restSamples);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Header with Step Dots & Timer */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft mb-8">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-brand-ink dark:text-white flex items-center gap-3">
            <Hand className="w-7 h-7 text-brand-teal" />
            <span>Teach REACH</span>
          </h1>
          <p className="text-xs text-brand-muted dark:text-dark-muted">
            Step {step} of 4 • Grade 5 Simple Setup
          </p>
        </div>

        {/* 4-Dot Progress Bar */}
        <div className="flex items-center gap-3">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm transition-all ${
                step === s
                  ? 'bg-brand-teal text-white shadow-glow ring-4 ring-brand-teal/20'
                  : step > s
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
              }`}
            >
              {step > s ? <CheckCircle2 className="w-5 h-5" /> : s}
            </div>
          ))}
        </div>

        {/* Time to Teach Timer */}
        <div className="flex items-center gap-2 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-4 py-2 rounded-xl font-mono font-bold text-sm border border-amber-500/30">
          <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
          <span>Time to teach: {teachTimeSeconds}s</span>
        </div>
      </div>

      {/* Step 1: Who is this for? */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-dark-card p-8 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft max-w-2xl mx-auto space-y-6">
          <div className="flex items-center gap-3 text-brand-teal">
            <User className="w-8 h-8" />
            <h2 className="text-2xl font-bold font-heading text-brand-ink dark:text-white">
              Who is this for?
            </h2>
          </div>
          <p className="text-sm text-brand-muted dark:text-dark-muted">
            Enter the patient's name and bed number so the caregiver knows who is calling for help.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold mb-2">Patient Name</label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-base font-medium focus:ring-2 focus:ring-brand-teal outline-none"
                placeholder="e.g. Ravi"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">Bed / Room Number</label>
              <input
                type="text"
                value={patientBed}
                onChange={(e) => setPatientBed(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-base font-medium focus:ring-2 focus:ring-brand-teal outline-none"
                placeholder="e.g. Bed 4"
              />
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full h-14 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <span>Continue to Pick Requests</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      )}

      {/* Step 2: Pick what you want to say */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft">
            <h2 className="text-2xl font-bold font-heading text-brand-ink dark:text-white mb-2">
              Pick what you want to say
            </h2>
            <p className="text-sm text-brand-muted dark:text-dark-muted mb-6">
              Choose at least 3 requests (up to 8) that you want to teach REACH.
            </p>

            {/* Grid of Preset Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              {PRESET_REQUESTS.map((req) => {
                const isSelected = selectedRequests.some((r) => r.label === req.label);
                return (
                  <button
                    key={req.id}
                    onClick={() => {
                      if (isSelected) {
                        if (selectedRequests.length > 3) {
                          setSelectedRequests((prev) => prev.filter((r) => r.label !== req.label));
                        }
                      } else {
                        if (selectedRequests.length < 8) {
                          setSelectedRequests((prev) => [...prev, { id: req.id, label: req.label, priority: req.priority }]);
                        }
                      }
                    }}
                    className={`p-5 rounded-2xl border-2 text-left flex flex-col justify-between h-36 transition-all ${
                      isSelected
                        ? 'border-brand-teal bg-brand-teal-soft/40 dark:bg-brand-teal/20 shadow-soft'
                        : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-3xl">{req.icon}</span>
                      {isSelected && <CheckCircle2 className="w-6 h-6 text-brand-teal" />}
                    </div>
                    <div>
                      <span className="font-heading font-bold text-lg block text-brand-ink dark:text-white">
                        {req.label}
                      </span>
                      <span className="text-xs uppercase font-semibold text-brand-muted dark:text-dark-muted">
                        {req.priority}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                disabled={selectedRequests.length < 3}
                onClick={() => {
                  setStep(3);
                  setCurrentGestureIndex(0);
                }}
                className="h-14 px-8 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all"
              >
                <span>Continue ({selectedRequests.length} selected)</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Step 3: Show your movement */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Camera Feed */}
          <div className="lg:col-span-7">
            <CameraView onLandmarksDetected={handleLandmarks} className="w-full aspect-[4/3] rounded-2xl" />
          </div>

          {/* Right: Instructions & Controls */}
          <div className="lg:col-span-5 bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
            <div className="flex items-center justify-between border-b pb-4 border-gray-100 dark:border-gray-800">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-teal">
                Gesture {currentGestureIndex + 1} of {selectedRequests.length}
              </span>
              <span className="font-heading font-bold text-xl text-brand-ink dark:text-white">
                "{selectedRequests[currentGestureIndex]?.label}"
              </span>
            </div>

            <p className="text-sm text-brand-muted dark:text-dark-muted leading-relaxed">
              Do a movement you can do easily. A hand shape or a small wrist move is fine.
            </p>

            {/* Gesture Kind Picker */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGestureKind('pose')}
                className={`py-3 px-4 rounded-xl font-bold text-xs border transition-all ${
                  gestureKind === 'pose'
                    ? 'bg-brand-teal text-white border-brand-teal shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Hold a hand shape
              </button>
              <button
                onClick={() => setGestureKind('move')}
                className={`py-3 px-4 rounded-xl font-bold text-xs border transition-all ${
                  gestureKind === 'move'
                    ? 'bg-brand-teal text-white border-brand-teal shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Do a small move
              </button>
            </div>

            {/* Recording State Status Box */}
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-center">
              {recordingState === 'IDLE' && (
                <button
                  onClick={startRecordingCurrentGesture}
                  className="w-full h-14 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                >
                  <span>Start Recording (3 Rounds)</span>
                </button>
              )}

              {recordingState === 'COUNTDOWN' && (
                <div className="text-center py-4">
                  <span className="text-5xl font-black font-heading text-brand-teal animate-bounce block mb-2">
                    {countdown}
                  </span>
                  <span className="text-sm font-semibold text-brand-muted">Get ready to hold movement...</span>
                </div>
              )}

              {recordingState === 'RECORDING' && (
                <div className="text-center py-4 space-y-2">
                  <div className="inline-block w-4 h-4 rounded-full bg-red-500 animate-ping mb-2" />
                  <h4 className="font-heading font-bold text-lg text-brand-teal">
                    Recording Round {round} of 3
                  </h4>
                  <p className="text-xs text-brand-muted">Hold your hand shape still...</p>
                  <span className="inline-block px-3 py-1 bg-brand-teal/20 text-brand-teal font-bold text-xs rounded-full">
                    Got it {collectedSamples.length} samples
                  </span>
                </div>
              )}

              {recordingState === 'RELAX' && (
                <div className="text-center py-4 space-y-2">
                  <h4 className="font-heading font-bold text-lg text-amber-500">
                    Relax your hand...
                  </h4>
                  <p className="text-xs text-brand-muted">Rest for 1 second before next round</p>
                </div>
              )}

              {recordingState === 'DONE' && (
                <div className="text-center py-4 space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h4 className="font-heading font-bold text-lg text-emerald-600">
                    Got it! REACH learned "{selectedRequests[currentGestureIndex]?.label}".
                  </h4>

                  {currentGestureIndex < selectedRequests.length - 1 ? (
                    <button
                      onClick={() => {
                        setCurrentGestureIndex((prev) => prev + 1);
                        setRecordingState('IDLE');
                      }}
                      className="w-full h-14 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                    >
                      <span>Next Gesture ({selectedRequests[currentGestureIndex + 1]?.label})</span>
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setStep(4);
                        setRecordingState('IDLE');
                      }}
                      className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                    >
                      <span>Continue to Rest Hand Step</span>
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Step 4: Rest hand step */}
      {step === 4 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            <CameraView onLandmarksDetected={handleLandmarks} className="w-full aspect-[4/3] rounded-2xl" />
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
            <h2 className="text-2xl font-bold font-heading text-brand-ink dark:text-white">
              Rest Hand Step
            </h2>
            <p className="text-sm text-brand-muted dark:text-dark-muted leading-relaxed">
              Now just relax or move your hand around normally for 5 seconds. Save these as "not a request" samples to stop false alarms.
            </p>

            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-center">
              {recordingState === 'IDLE' && (
                <button
                  onClick={startRestRecording}
                  className="w-full h-14 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                >
                  <span>Record 5s Rest Hand</span>
                </button>
              )}

              {recordingState === 'RECORDING' && (
                <div className="py-4">
                  <div className="w-4 h-4 rounded-full bg-emerald-500 animate-ping mx-auto mb-2" />
                  <h4 className="font-heading font-bold text-lg text-emerald-600">
                    Recording relaxed hand movement...
                  </h4>
                </div>
              )}

              {recordingState === 'DONE' && (
                <div className="py-4 space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h4 className="font-heading font-bold text-lg text-emerald-600">
                    Rest samples saved successfully!
                  </h4>
                  <button
                    onClick={() => {
                      saveFinalProfile();
                      setStep(5);
                    }}
                    className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                  >
                    <span>Try It Now (Test Screen)</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Step 5: Try it now (Free test screen & Gesture Coach) */}
      {step === 5 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7">
              <CameraView onLandmarksDetected={handleLandmarks} className="w-full aspect-[4/3] rounded-2xl" />
            </div>

            <div className="lg:col-span-5 bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
              <div className="flex items-center justify-between border-b pb-4 border-gray-100 dark:border-gray-800">
                <h2 className="text-2xl font-bold font-heading text-brand-ink dark:text-white">
                  Free Test Screen
                </h2>
                <span className="text-xs font-semibold px-3 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Saved on laptop
                </span>
              </div>

              {/* Live Test Feedback Box */}
              <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-lg text-center">
                <p className="text-xs font-semibold uppercase text-slate-400 mb-1">
                  Live Recognized Gesture
                </p>
                <div className="text-3xl font-heading font-extrabold text-brand-teal mb-2">
                  {testResult?.label ? testResult.label : 'None (Rest Hand)'}
                </div>
                <div className="text-xs text-gray-300">
                  How sure REACH is:{' '}
                  <span className="font-bold text-amber-400">
                    {testResult ? Math.round(testResult.confidence * 100) : 0}%
                  </span>
                </div>
              </div>

              {/* Taught Gestures List */}
              <div className="space-y-3">
                <h3 className="font-heading font-bold text-sm text-brand-ink dark:text-white">
                  Taught Profile Movements:
                </h3>
                {taughtGestures.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700"
                  >
                    <span className="font-heading font-bold text-base">{g.label}</span>
                    <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                      {g.samples.length} samples
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Gesture Coach Section */}
          <div className="bg-white dark:bg-dark-card p-8 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
            <div className="flex items-center gap-3">
              <Sparkles className="w-7 h-7 text-brand-teal" />
              <div>
                <h3 className="text-2xl font-bold font-heading text-brand-ink dark:text-white">
                  Gesture Coach Analysis
                </h3>
                <p className="text-xs text-brand-muted dark:text-dark-muted">
                  Automatic comfort evaluation & 2D gesture separation map
                </p>
              </div>
            </div>

            {/* Warnings */}
            {coachAnalysis.warnings.length > 0 ? (
              coachAnalysis.warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center gap-3 text-amber-800 dark:text-amber-300 text-sm"
                >
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" />
                  <span>{w.message}</span>
                </div>
              ))
            ) : (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
                ✅ Excellent! All your taught gestures are distinct and clearly separated.
              </div>
            )}

            {/* Comfort Scores Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {coachAnalysis.comfortScores.map((cs) => (
                <div
                  key={cs.gestureId}
                  className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700"
                >
                  <span className="font-heading font-bold text-base block mb-1">{cs.label}</span>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-md inline-block ${
                      cs.score === 'Easy for you'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    {cs.score}
                  </span>
                </div>
              ))}
            </div>

            {/* 2D Movement Map Scatter Plot */}
            <div className="p-6 rounded-2xl bg-slate-900 text-white space-y-3">
              <div className="flex items-center gap-2">
                <ScatterChart className="w-5 h-5 text-brand-teal" />
                <h4 className="font-heading font-bold text-base">2D Movement Map</h4>
              </div>
              <p className="text-xs text-gray-400">
                Visual proof that your taught gestures form separate clusters in 2D space.
              </p>

              <div className="relative w-full h-48 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center">
                {coachAnalysis.movementMap.map((pt, idx) => (
                  <div
                    key={idx}
                    style={{
                      left: `${Math.min(90, Math.max(10, pt.x + 50))}%`,
                      top: `${Math.min(90, Math.max(10, pt.y + 50))}%`,
                    }}
                    className={`absolute w-3 h-3 rounded-full transform -translate-x-1/2 -translate-y-1/2 ${
                      pt.kind === 'rest'
                        ? 'bg-gray-500'
                        : pt.label === 'Water'
                        ? 'bg-cyan-400'
                        : pt.label === 'Pain'
                        ? 'bg-red-400'
                        : 'bg-emerald-400'
                    }`}
                    title={`${pt.label} (${pt.x}, ${pt.y})`}
                  />
                ))}
              </div>
            </div>

          </div>

        </motion.div>
      )}

    </div>
  );
};
