import React, { useState, useEffect, useRef } from 'react';
import { CameraView } from '../components/CameraView';
import { extractPoseFeatures } from '../engine/features';
import { normalizeLandmarks, LandmarkSmoother } from '../engine/normalize';
import { classifyGesture } from '../engine/knn';
import { analyzeGestureProfile } from '../engine/coach';
import { GestureDefinition, PriorityLevel, UserProfile, Landmark, GestureKind } from '../engine/types';
import { validateSingleSample, validateTrainingSession } from '../engine/validation';
import {
  getAllPatients,
  getActivePatient,
  setActivePatientId,
  savePatient,
  createPatient,
  deletePatient,
} from '../utils/profileStorage';
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
  Plus,
  Trash2,
  Edit2,
  Users,
  ChevronDown,
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
  // Patients list and selected patient
  const [patients, setPatients] = useState<UserProfile[]>([]);
  const [activePatient, setActivePatient] = useState<UserProfile | null>(null);
  const [showNewPatientModal, setShowNewPatientModal] = useState<boolean>(false);
  const [newPatientName, setNewPatientName] = useState<string>('');
  const [newPatientBed, setNewPatientBed] = useState<string>('');
  const [newPatientCaregiver, setNewPatientCaregiver] = useState<string>('Priya');
  const [newPatientNotes, setNewPatientNotes] = useState<string>('');

  // Workflow state
  const [step, setStep] = useState<number>(1); // 1: Manage & Pick, 2: Rest Hand, 3: Teach Gestures, 4: Live Test & Coach
  const [selectedRequests, setSelectedRequests] = useState<
    { id: string; label: string; priority: PriorityLevel }[]
  >([]);

  // Custom request input
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [customLabel, setCustomLabel] = useState<string>('');
  const [customPriority, setCustomPriority] = useState<PriorityLevel>('normal');

  // Teaching recording state
  const [currentGestureIndex, setCurrentGestureIndex] = useState<number>(0);
  const [gestureKind, setGestureKind] = useState<GestureKind>('pose');
  const [recordingState, setRecordingState] = useState<
    'IDLE' | 'COUNTDOWN' | 'RECORDING' | 'RELAX' | 'DONE' | 'INVALID_SESSION'
  >('IDLE');
  const [countdown, setCountdown] = useState<number>(3);
  const [round, setRound] = useState<number>(1); // 3 rounds
  const [collectedSamples, setCollectedSamples] = useState<number[][]>([]);
  const [validCount, setValidCount] = useState<number>(0);
  const [rejectedCount, setRejectedCount] = useState<number>(0);
  const [sessionConsistencyScore, setSessionConsistencyScore] = useState<number>(0);
  const [sessionWarning, setSessionWarning] = useState<string | null>(null);
  const [taughtGestures, setTaughtGestures] = useState<GestureDefinition[]>([]);
  const [restSamples, setRestSamples] = useState<number[][]>([]);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);

  // Timer: "Time to teach"
  const [teachTimeSeconds, setTeachTimeSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Live landmarks ref and smoother
  const currentLandmarksRef = useRef<Landmark[] | null>(null);
  const smootherRef = useRef<LandmarkSmoother>(new LandmarkSmoother(0.65));

  // Test screen live feedback
  const [testResult, setTestResult] = useState<{
    label: string | null;
    confidence: number;
    margin: number;
  } | null>(null);

  // Load patients on mount
  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    const list = await getAllPatients();
    setPatients(list);
    const active = await getActivePatient();
    setActivePatient(active);
    setTaughtGestures(active.gestures || []);
    setRestSamples(active.restSamples || []);

    // Initialize selected requests from existing gestures or defaults
    if (active.gestures && active.gestures.length > 0) {
      setSelectedRequests(
        active.gestures.map((g) => ({
          id: g.id,
          label: g.label,
          priority: g.priority,
        }))
      );
    } else {
      setSelectedRequests([
        { id: 'water', label: 'Water', priority: 'normal' },
        { id: 'pain', label: 'Pain', priority: 'urgent' },
        { id: 'bathroom', label: 'Bathroom', priority: 'normal' },
      ]);
    }
  };

  const handleSelectPatient = (patientId: string) => {
    setActivePatientId(patientId);
    const found = patients.find((p) => p.id === patientId);
    if (found) {
      setActivePatient(found);
      setTaughtGestures(found.gestures || []);
      setRestSamples(found.restSamples || []);
      if (found.gestures && found.gestures.length > 0) {
        setSelectedRequests(
          found.gestures.map((g) => ({
            id: g.id,
            label: g.label,
            priority: g.priority,
          }))
        );
      } else {
        setSelectedRequests([
          { id: 'water', label: 'Water', priority: 'normal' },
          { id: 'pain', label: 'Pain', priority: 'urgent' },
          { id: 'bathroom', label: 'Bathroom', priority: 'normal' },
        ]);
      }
      setStep(1);
      setRecordingState('IDLE');
    }
  };

  const handleCreatePatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim() || !newPatientBed.trim()) return;

    const created = await createPatient({
      name: newPatientName.trim(),
      bed: newPatientBed.trim(),
      assignedCaregiver: newPatientCaregiver.trim(),
      notes: newPatientNotes.trim(),
      gestures: [],
      restSamples: [],
    });

    if (created) {
      const updatedList = await getAllPatients();
      setPatients(updatedList);
      handleSelectPatient(created.id);
      setShowNewPatientModal(false);
      setNewPatientName('');
      setNewPatientBed('');
      setNewPatientNotes('');
    }
  };

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

  // Handle landmarks from CameraView
  const handleLandmarks = (landmarks: any) => {
    if (!landmarks || landmarks.length === 0) {
      currentLandmarksRef.current = null;
      return;
    }
    // Smooth raw landmarks
    const smoothed = smootherRef.current.smooth(landmarks[0]);
    currentLandmarksRef.current = smoothed;

    // Live classification during Test Step (Step 4)
    if (step === 4 && taughtGestures.length > 0) {
      const norm1 = normalizeLandmarks(smoothed, false, true);
      const feat1 = extractPoseFeatures(norm1);
      const res1 = classifyGesture(feat1, taughtGestures, restSamples);

      const norm2 = normalizeLandmarks(smoothed, true, true);
      const feat2 = extractPoseFeatures(norm2);
      const res2 = classifyGesture(feat2, taughtGestures, restSamples);

      const best = res1.confidence >= res2.confidence ? res1 : res2;
      setTestResult({
        label: best.label,
        confidence: best.confidence,
        margin: best.margin,
      });
    }
  };

  // Start recording workflow for a gesture
  const startRecordingCurrentGesture = () => {
    setRecordingState('COUNTDOWN');
    setCountdown(3);
    setCollectedSamples([]);
    setValidCount(0);
    setRejectedCount(0);
    setRound(1);
    setSessionWarning(null);
    setValidationWarning(null);
    if (!isTimerRunning) setIsTimerRunning(true);

    let cd = 3;
    const interval = setInterval(() => {
      cd--;
      setCountdown(cd);
      if (cd <= 0) {
        clearInterval(interval);
        setRecordingState('RECORDING');
        captureSamplesLoop(1, [], 0, 0);
      }
    }, 1000);
  };

  const captureSamplesLoop = (
    currentRound: number,
    accumulated: number[][],
    totalValid: number,
    totalRejected: number
  ) => {
    let roundValidCount = 0;
    const roundSamples: number[][] = [];
    let localValid = totalValid;
    let localRejected = totalRejected;

    const interval = setInterval(() => {
      if (currentLandmarksRef.current) {
        const normalized = normalizeLandmarks(currentLandmarksRef.current);
        const features = extractPoseFeatures(normalized);

        // Validate sample against baseline and running samples
        const check = validateSingleSample(features, [...accumulated, ...roundSamples], restSamples, 1.40);
        if (check.isValid) {
          roundSamples.push(features);
          roundValidCount++;
          localValid++;
          setValidCount(localValid);
          setValidationWarning(null);
        } else {
          localRejected++;
          setRejectedCount(localRejected);
          setValidationWarning(`⚠️ ${check.reason || 'Inconsistent hand pose. Repeat the SAME gesture.'}`);
        }
      } else {
        setValidationWarning('Hand not detected! Keep your hand visible inside the camera frame.');
      }

      // Collect 10 valid samples per round (or exit after 18 frames)
      if (roundValidCount >= 10 || roundSamples.length + localRejected >= 18 * currentRound) {
        clearInterval(interval);
        setValidationWarning(null);
        const combined = [...accumulated, ...roundSamples];
        setCollectedSamples(combined);

        if (currentRound < 3) {
          setRecordingState('RELAX');
          setTimeout(() => {
            setRound(currentRound + 1);
            setRecordingState('RECORDING');
            captureSamplesLoop(currentRound + 1, combined, localValid, localRejected);
          }, 1400); // 1.4s relax interval between rounds
        } else {
          // Perform full session validation across all 3 rounds
          const currentReq = selectedRequests[currentGestureIndex];
          const sessionRes = validateTrainingSession(
            combined,
            restSamples,
            taughtGestures,
            currentReq?.label
          );

          setSessionConsistencyScore(sessionRes.consistencyScore);

          if (!sessionRes.isValid) {
            setRecordingState('INVALID_SESSION');
            setSessionWarning(
              sessionRes.warning || 'Your gestures are inconsistent. Please repeat the SAME gesture.'
            );
            return;
          }

          setRecordingState('DONE');
          setSessionWarning(null);

          // Save completed verified gesture with validated samples only
          const newDef: GestureDefinition = {
            id: currentReq.id.startsWith('g_') ? currentReq.id : `g_${Date.now()}_${currentReq.id}`,
            label: currentReq.label,
            priority: currentReq.priority,
            kind: 'pose',
            samples: sessionRes.validSamples,
            createdAt: Date.now(),
          };

          const updatedGestures = [
            ...taughtGestures.filter((g) => g.label.toLowerCase() !== currentReq.label.toLowerCase()),
            newDef,
          ];
          setTaughtGestures(updatedGestures);

          // Persist directly to patient profile so it survives reloads & restarts
          if (activePatient) {
            const updatedPatient: UserProfile = {
              ...activePatient,
              gestures: updatedGestures,
              updatedAt: Date.now(),
            };
            setActivePatient(updatedPatient);
            savePatient(updatedPatient);
          }
        }
      }
    }, 110);
  };

  // Rest Hand Recording (Neutral baseline)
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

      if (count >= 30) {
        clearInterval(interval);
        setRestSamples(restAcc);
        setRecordingState('DONE');

        if (activePatient) {
          const updatedPatient: UserProfile = {
            ...activePatient,
            restSamples: restAcc,
            updatedAt: Date.now(),
          };
          setActivePatient(updatedPatient);
          savePatient(updatedPatient);
        }
      }
    }, 120);
  };

  // Retrain an existing gesture
  const handleRetrainGesture = (gestureLabel: string) => {
    const idx = selectedRequests.findIndex((r) => r.label === gestureLabel);
    if (idx >= 0) {
      setCurrentGestureIndex(idx);
    } else {
      const g = taughtGestures.find((t) => t.label === gestureLabel);
      if (g) {
        setSelectedRequests((prev) => [...prev, { id: g.id, label: g.label, priority: g.priority }]);
        setCurrentGestureIndex(selectedRequests.length);
      }
    }
    setStep(3);
    setRecordingState('IDLE');
  };

  // Delete an existing gesture
  const handleDeleteGesture = async (gestureId: string) => {
    if (!confirm('Are you sure you want to delete this gesture?')) return;
    const filtered = taughtGestures.filter((g) => g.id !== gestureId);
    setTaughtGestures(filtered);
    setSelectedRequests((prev) => prev.filter((r) => r.id !== gestureId));
    if (activePatient) {
      const updated: UserProfile = {
        ...activePatient,
        gestures: filtered,
        updatedAt: Date.now(),
      };
      setActivePatient(updated);
      await savePatient(updated);
    }
  };

  // Save final profile
  const saveFinalProfile = async () => {
    setIsTimerRunning(false);
    if (!activePatient) return;

    const profileToSave: UserProfile = {
      ...activePatient,
      gestures: taughtGestures,
      restSamples,
      updatedAt: Date.now(),
    };

    setActivePatient(profileToSave);
    await savePatient(profileToSave);
  };

  const coachAnalysis = analyzeGestureProfile(taughtGestures, restSamples);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Patient Switcher & Header */}
      <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-brand-ink dark:text-white flex items-center gap-3">
            <Hand className="w-7 h-7 text-brand-teal" />
            <span>Teach REACH</span>
          </h1>
          <p className="text-xs text-brand-muted dark:text-dark-muted mt-1">
            Personalized Hand Gesture Training & Patient Profiles
          </p>
        </div>

        {/* Patient Selection Dropdown */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <label className="text-[11px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
              Active Patient
            </label>
            <div className="flex items-center gap-2">
              <select
                value={activePatient?.id || ''}
                onChange={(e) => handleSelectPatient(e.target.value)}
                className="px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 font-bold text-sm text-brand-ink dark:text-white focus:ring-2 focus:ring-brand-teal outline-none cursor-pointer"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.bed || 'No Bed'}) {p.assignedCaregiver ? `• Caregiver: ${p.assignedCaregiver}` : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowNewPatientModal(true)}
                className="p-2.5 rounded-xl bg-brand-teal/10 hover:bg-brand-teal text-brand-teal hover:text-white transition-colors border border-brand-teal/30"
                title="Register New Patient"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Time to Teach */}
          <div className="hidden sm:flex items-center gap-2 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3.5 py-2 rounded-xl font-mono font-bold text-xs border border-amber-500/30 self-end">
            <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
            <span>{teachTimeSeconds}s</span>
          </div>
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="flex items-center justify-between bg-white dark:bg-dark-card px-6 py-4 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft">
        {[
          { num: 1, label: '1. Select Requests' },
          { num: 2, label: '2. Rest Hand' },
          { num: 3, label: '3. Train Gestures' },
          { num: 4, label: '4. Test & Validate' },
        ].map((s) => (
          <button
            key={s.num}
            onClick={() => setStep(s.num)}
            className={`flex items-center gap-2 text-xs font-bold transition-colors ${
              step === s.num
                ? 'text-brand-teal font-extrabold'
                : step > s.num
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-gray-400 dark:text-gray-600'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                step === s.num
                  ? 'bg-brand-teal text-white shadow-md'
                  : step > s.num
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
              }`}
            >
              {step > s.num ? <CheckCircle2 className="w-4 h-4" /> : s.num}
            </div>
            <span className="hidden md:inline">{s.label}</span>
          </button>
        ))}
      </div>

      {/* STEP 1: Requests & Profile Management */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
            
            {/* Active Patient Details Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-teal/20 text-brand-teal flex items-center justify-center font-bold">
                  {activePatient?.name.charAt(0) || 'P'}
                </div>
                <div>
                  <h3 className="font-heading font-bold text-base text-brand-ink dark:text-white">
                    {activePatient?.name} • {activePatient?.bed}
                  </h3>
                  <p className="text-xs text-brand-muted">
                    Assigned Caregiver: <span className="font-semibold text-brand-teal">{activePatient?.assignedCaregiver || 'Priya'}</span>
                    {activePatient?.notes && ` • Notes: ${activePatient.notes}`}
                  </p>
                </div>
              </div>

              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                {taughtGestures.length} Trained Gestures
              </span>
            </div>

            {/* Existing Gestures Table / Management */}
            {taughtGestures.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-heading font-bold text-sm text-brand-ink dark:text-white">
                  Currently Saved Gestures for {activePatient?.name}:
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {taughtGestures.map((g) => (
                    <div
                      key={g.id}
                      className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-heading font-bold text-base block">{g.label}</span>
                        <span className="text-[11px] font-semibold uppercase text-brand-muted">
                          {g.priority} • {g.samples.length} samples
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRetrainGesture(g.label)}
                          className="p-2 text-xs font-bold text-brand-teal hover:bg-brand-teal/10 rounded-lg transition-colors"
                          title="Retrain Gesture"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteGesture(g.id)}
                          className="p-2 text-xs font-bold text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete Gesture"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pick Requests to Teach */}
            <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-heading font-bold text-lg text-brand-ink dark:text-white">
                    Select Assistance Requests
                  </h3>
                  <p className="text-xs text-brand-muted">
                    Choose what {activePatient?.name} needs to communicate.
                  </p>
                </div>
                <button
                  onClick={() => setShowCustomModal(true)}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-brand-teal hover:text-white transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Custom Request</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PRESET_REQUESTS.map((req) => {
                  const isSelected = selectedRequests.some((r) => r.label === req.label);
                  return (
                    <button
                      key={req.id}
                      onClick={() => {
                        if (isSelected) {
                          if (selectedRequests.length > 1) {
                            setSelectedRequests((prev) => prev.filter((r) => r.label !== req.label));
                          }
                        } else {
                          setSelectedRequests((prev) => [
                            ...prev,
                            { id: req.id, label: req.label, priority: req.priority },
                          ]);
                        }
                      }}
                      className={`p-4 rounded-xl border-2 text-left flex flex-col justify-between h-28 transition-all ${
                        isSelected
                          ? 'border-brand-teal bg-brand-teal-soft/30 dark:bg-brand-teal/20 shadow-sm'
                          : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{req.icon}</span>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-brand-teal" />}
                      </div>
                      <div>
                        <span className="font-heading font-bold text-sm block">{req.label}</span>
                        <span className="text-[10px] uppercase font-semibold text-brand-muted">
                          {req.priority}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                disabled={selectedRequests.length === 0}
                onClick={() => setStep(2)}
                className="h-12 px-8 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all text-sm"
              >
                <span>Continue to Rest Hand ({selectedRequests.length} selected)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* STEP 2: Rest Hand (Neutral baseline) */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            <CameraView onLandmarksDetected={handleLandmarks} className="w-full aspect-[4/3] rounded-2xl" />
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
            <div>
              <h2 className="text-2xl font-bold font-heading text-brand-ink dark:text-white">
                Rest Hand Recording
              </h2>
              <p className="text-xs text-brand-muted mt-1 leading-relaxed">
                Relax your hand or rest it naturally in your lap for 5 seconds. This teaches REACH what ordinary resting movements look like so they never trigger accidental assistance requests.
              </p>
            </div>

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
                <div className="py-4 space-y-2">
                  <div className="w-4 h-4 rounded-full bg-emerald-500 animate-ping mx-auto" />
                  <h4 className="font-heading font-bold text-lg text-emerald-600">
                    Recording relaxed hand position...
                  </h4>
                  <p className="text-xs text-brand-muted">Keep resting naturally</p>
                </div>
              )}

              {recordingState === 'DONE' && (
                <div className="py-4 space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h4 className="font-heading font-bold text-lg text-emerald-600">
                    Rest samples saved!
                  </h4>
                  <button
                    onClick={() => {
                      setStep(3);
                      setCurrentGestureIndex(0);
                      setRecordingState('IDLE');
                    }}
                    className="w-full h-14 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg"
                  >
                    <span>Proceed to Gesture Training</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* STEP 3: Gesture Training */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7">
            <CameraView onLandmarksDetected={handleLandmarks} className="w-full aspect-[4/3] rounded-2xl" />
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
            <div className="flex items-center justify-between border-b pb-4 border-gray-100 dark:border-gray-800">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-teal">
                Gesture {currentGestureIndex + 1} of {selectedRequests.length}
              </span>
              <span className="font-heading font-bold text-xl text-brand-ink dark:text-white">
                "{selectedRequests[currentGestureIndex]?.label}"
              </span>
            </div>

            <p className="text-xs text-brand-muted leading-relaxed">
              Perform any comfortable hand pose (open palm, fist, pointing finger, thumbs up, etc.) that {activePatient?.name} can repeat easily.
            </p>

            {validationWarning && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-amber-800 dark:text-amber-300 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{validationWarning}</span>
              </div>
            )}

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
                  <span className="text-xs font-semibold text-brand-muted">Get ready to hold gesture...</span>
                </div>
              )}

              {recordingState === 'RECORDING' && (
                <div className="text-center py-4 space-y-2">
                  <div className="inline-block w-4 h-4 rounded-full bg-red-500 animate-ping mb-1" />
                  <h4 className="font-heading font-bold text-lg text-brand-teal">
                    Recording Round {round} of 3
                  </h4>
                  <p className="text-xs text-brand-muted">Hold your gesture steady without switching poses...</p>
                  
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-xs rounded-full">
                      ✓ {validCount} valid samples
                    </span>
                    {rejectedCount > 0 && (
                      <span className="px-3 py-1 bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-xs rounded-full">
                        ✕ {rejectedCount} rejected
                      </span>
                    )}
                  </div>
                </div>
              )}

              {recordingState === 'RELAX' && (
                <div className="text-center py-4 space-y-2">
                  <h4 className="font-heading font-bold text-lg text-amber-500">
                    Relax your hand...
                  </h4>
                  <p className="text-xs text-brand-muted">Rest for 1 second before next round</p>
                  <div className="text-xs font-semibold text-emerald-600">
                    Round {round - 1} completed ({validCount} valid samples collected)
                  </div>
                </div>
              )}

              {recordingState === 'INVALID_SESSION' && (
                <div className="text-center py-4 space-y-4">
                  <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-left space-y-2">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
                      <AlertTriangle className="w-5 h-5 shrink-0" />
                      Training Rejected: Inconsistent Gestures
                    </div>
                    <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                      {sessionWarning || 'Your gestures are inconsistent. Please repeat the SAME gesture.'}
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                      <div className="p-2 bg-white/70 dark:bg-black/30 rounded border border-red-200 dark:border-red-900">
                        <span className="block font-bold text-emerald-600 text-base">{validCount}</span>
                        <span className="text-[10px] text-brand-muted">Valid</span>
                      </div>
                      <div className="p-2 bg-white/70 dark:bg-black/30 rounded border border-red-200 dark:border-red-900">
                        <span className="block font-bold text-red-600 text-base">{rejectedCount}</span>
                        <span className="text-[10px] text-brand-muted">Rejected</span>
                      </div>
                      <div className="p-2 bg-white/70 dark:bg-black/30 rounded border border-red-200 dark:border-red-900">
                        <span className="block font-bold text-amber-600 text-base">{sessionConsistencyScore}%</span>
                        <span className="text-[10px] text-brand-muted">Consistency</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={startRecordingCurrentGesture}
                    className="w-full h-14 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg text-sm"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Repeat Same Gesture (Retry)</span>
                  </button>
                </div>
              )}

              {recordingState === 'DONE' && (
                <div className="text-center py-4 space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h4 className="font-heading font-bold text-base text-emerald-600">
                    Learned "{selectedRequests[currentGestureIndex]?.label}"!
                  </h4>

                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-left space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-800 dark:text-emerald-300">Training Quality:</span>
                      <span className="font-bold text-emerald-600">{sessionConsistencyScore}% Consistency</span>
                    </div>
                    <div className="text-[11px] text-brand-muted">
                      {validCount} consistent samples verified & saved persistently for {activePatient?.name}.
                    </div>
                  </div>

                  {currentGestureIndex < selectedRequests.length - 1 ? (
                    <button
                      onClick={() => {
                        setCurrentGestureIndex((prev) => prev + 1);
                        setRecordingState('IDLE');
                      }}
                      className="w-full h-14 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg text-sm"
                    >
                      <span>Next Gesture ({selectedRequests[currentGestureIndex + 1]?.label})</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        saveFinalProfile();
                        setStep(4);
                        setRecordingState('IDLE');
                      }}
                      className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg text-sm"
                    >
                      <span>Validate on Test Screen</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* STEP 4: Live Test & Coach Analysis */}
      {step === 4 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7">
              <CameraView onLandmarksDetected={handleLandmarks} className="w-full aspect-[4/3] rounded-2xl" />
            </div>

            <div className="lg:col-span-5 bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
              <div className="flex items-center justify-between border-b pb-4 border-gray-100 dark:border-gray-800">
                <h2 className="text-2xl font-bold font-heading text-brand-ink dark:text-white">
                  Live Test Screen
                </h2>
                <span className="text-xs font-semibold px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Saved for {activePatient?.name}
                </span>
              </div>

              {/* Real-time Recognition Badge */}
              <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-lg text-center space-y-2">
                <p className="text-xs font-semibold uppercase text-slate-400">
                  Recognized Gesture
                </p>
                <div className="text-3xl font-heading font-extrabold text-brand-teal">
                  {testResult?.label ? testResult.label : 'None / Resting'}
                </div>
                <div className="text-xs text-gray-300 flex justify-center gap-4">
                  <span>Confidence: <strong className="text-amber-400">{testResult ? Math.round(testResult.confidence * 100) : 0}%</strong></span>
                  <span>Margin: <strong className="text-emerald-400">{testResult ? Math.round(testResult.margin * 100) : 0}%</strong></span>
                </div>
              </div>

              {/* Saved Gestures List */}
              <div className="space-y-2">
                <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-brand-muted">
                  Trained Gestures for {activePatient?.name}:
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {taughtGestures.map((g) => (
                    <div
                      key={g.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        testResult?.label === g.label
                          ? 'bg-brand-teal/20 border-brand-teal'
                          : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <span className="font-heading font-bold text-sm">{g.label}</span>
                      <span className="text-xs font-semibold text-brand-muted">{g.samples.length} samples</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <a
                  href="/live"
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors text-sm"
                >
                  <span>Go to Live Patient Station</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>

          {/* Gesture Coach Analysis */}
          <div className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-brand-teal" />
              <div>
                <h3 className="text-xl font-bold font-heading text-brand-ink dark:text-white">
                  Gesture Coach Analysis
                </h3>
                <p className="text-xs text-brand-muted">
                  Geometric separation and comfort evaluation
                </p>
              </div>
            </div>

            {coachAnalysis.warnings.length > 0 ? (
              coachAnalysis.warnings.map((w, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                  <span>{w.message}</span>
                </div>
              ))
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                ✅ Excellent! All taught gestures are clearly distinguishable without confusion.
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* MODAL: Register New Patient */}
      {showNewPatientModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full space-y-4">
            <h3 className="text-xl font-bold font-heading text-brand-ink dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-teal" />
              <span>Register New Patient</span>
            </h3>

            <form onSubmit={handleCreatePatient} className="space-y-4 text-xs font-bold">
              <div>
                <label className="block mb-1 text-brand-muted">Patient Name *</label>
                <input
                  type="text"
                  required
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  placeholder="e.g. Arjun"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>

              <div>
                <label className="block mb-1 text-brand-muted">Bed / Room Number *</label>
                <input
                  type="text"
                  required
                  value={newPatientBed}
                  onChange={(e) => setNewPatientBed(e.target.value)}
                  placeholder="e.g. Bed 12"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>

              <div>
                <label className="block mb-1 text-brand-muted">Assigned Caregiver</label>
                <input
                  type="text"
                  value={newPatientCaregiver}
                  onChange={(e) => setNewPatientCaregiver(e.target.value)}
                  placeholder="e.g. Priya"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>

              <div>
                <label className="block mb-1 text-brand-muted">Clinical Notes / Ability</label>
                <input
                  type="text"
                  value={newPatientNotes}
                  onChange={(e) => setNewPatientNotes(e.target.value)}
                  placeholder="e.g. Motor impairment in left hand, uses right"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewPatientModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-brand-teal text-white hover:bg-brand-teal-hover font-bold shadow-md"
                >
                  Create Patient
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* MODAL: Custom Request */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="bg-white dark:bg-dark-card p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-sm w-full space-y-4">
            <h3 className="text-lg font-bold font-heading text-brand-ink dark:text-white">
              Add Custom Request
            </h3>

            <div className="space-y-3 text-xs font-bold">
              <div>
                <label className="block mb-1 text-brand-muted">Request Label</label>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="e.g. Blankets, Nausea"
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-teal"
                />
              </div>

              <div>
                <label className="block mb-1 text-brand-muted">Priority</label>
                <select
                  value={customPriority}
                  onChange={(e) => setCustomPriority(e.target.value as PriorityLevel)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm font-medium outline-none focus:ring-2 focus:ring-brand-teal"
                >
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (customLabel.trim()) {
                      setSelectedRequests((prev) => [
                        ...prev,
                        {
                          id: `custom_${Date.now()}`,
                          label: customLabel.trim(),
                          priority: customPriority,
                        },
                      ]);
                      setCustomLabel('');
                      setShowCustomModal(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-brand-teal text-white hover:bg-brand-teal-hover"
                >
                  Add Request
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};
