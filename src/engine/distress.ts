/**
 * REACH Distress Watch Engine
 * Evaluates facial blendshape deviations against a personal baseline
 * Safe terminology: "May need a check", "Signal strength", "Looks uncomfortable"
 * Never claims medical diagnosis.
 */

export interface BlendshapeMap {
  [categoryName: string]: number;
}

export interface FaceSignals {
  brow: number;
  squint: number;
  nose: number;
  close: number;
  close_sustained: number;
  mouth: number;
  smile: number;
  jawOpen: number;
}

export interface PersonalFaceBaseline {
  calm: FaceSignals;
  spread: FaceSignals;
  scale?: Partial<FaceSignals>;
  isCalibrated: boolean;
  calibratedAt?: number;
}

export interface DistressSettings {
  enabled: boolean;
  thresholdLevel1: number; // default 0.45
  durationSecLevel1: number; // default 8 sec
  durationSecLevel2: number; // default 20 sec
  ratioFramesAbove: number; // default 0.70 (70% of frames)
  cooldownMs: number; // default 120,000 ms (2 minutes)
}

export interface DistressFrameAssessment {
  score: number;
  signals: FaceSignals;
  deltas: Partial<FaceSignals>;
  qualityOk: boolean;
  qualityReason?: string;
  isSmileGuarded: boolean;
  isYawnGuarded: boolean;
}

export interface DistressDecision {
  level: 0 | 1 | 2; // 0 = normal, 1 = May need a check, 2 = Needs a check now
  score: number;
  durationSec: number;
  activeSignals: {
    brow: boolean;
    squint: boolean;
    nose: boolean;
    close: boolean;
  };
  raisedCoreCount: number;
  recentScores: number[]; // 60-element sparkline history
  statusText: string;
  shouldTriggerAlert: boolean;
}

export const DEFAULT_DISTRESS_SETTINGS: DistressSettings = {
  enabled: false,
  thresholdLevel1: 0.45,
  durationSecLevel1: 8,
  durationSecLevel2: 20,
  ratioFramesAbove: 0.70,
  cooldownMs: 120000,
};

export const DEFAULT_FACE_BASELINE: PersonalFaceBaseline = {
  calm: {
    brow: 0.05,
    squint: 0.05,
    nose: 0.03,
    close: 0.05,
    close_sustained: 0.05,
    mouth: 0.05,
    smile: 0.05,
    jawOpen: 0.05,
  },
  spread: {
    brow: 0.05,
    squint: 0.05,
    nose: 0.03,
    close: 0.05,
    close_sustained: 0.05,
    mouth: 0.05,
    smile: 0.05,
    jawOpen: 0.05,
  },
  isCalibrated: false,
};

/**
 * Extracts normalized signal groups from 52 MediaPipe blendshapes
 */
export function extractFaceSignals(
  blendshapes: BlendshapeMap,
  sustainedBlinkTimeSec: number = 0
): FaceSignals {
  const get = (name: string) => blendshapes[name] || 0;

  const browDownLeft = get('browDownLeft');
  const browDownRight = get('browDownRight');
  const browInnerUp = get('browInnerUp'); // Eyebrows drawn together/raised in pain/agony
  // In pain/agony, people either knit brows down or pull inner brows up into a sharp peak
  const brow = Math.max((browDownLeft + browDownRight) / 2, browInnerUp * 0.95);

  const eyeSquintLeft = get('eyeSquintLeft');
  const eyeSquintRight = get('eyeSquintRight');
  const cheekSquintLeft = get('cheekSquintLeft');
  const cheekSquintRight = get('cheekSquintRight');
  const squint = (eyeSquintLeft + eyeSquintRight + cheekSquintLeft + cheekSquintRight) / 4;

  const noseSneerLeft = get('noseSneerLeft');
  const noseSneerRight = get('noseSneerRight');
  const mouthUpperUpLeft = get('mouthUpperUpLeft');
  const mouthUpperUpRight = get('mouthUpperUpRight');
  const nose = (noseSneerLeft + noseSneerRight + mouthUpperUpLeft + mouthUpperUpRight) / 4;

  const eyeBlinkLeft = get('eyeBlinkLeft');
  const eyeBlinkRight = get('eyeBlinkRight');
  const rawClose = (eyeBlinkLeft + eyeBlinkRight) / 2;
  // Blinks under 0.35s are ignored; sustained eye closure/wincing is counted
  const close_sustained = sustainedBlinkTimeSec >= 0.35 ? rawClose : 0;

  const mouthStretchLeft = get('mouthStretchLeft');
  const mouthStretchRight = get('mouthStretchRight');
  const mouthFrownLeft = get('mouthFrownLeft');
  const mouthFrownRight = get('mouthFrownRight');
  const mouthLowerDownLeft = get('mouthLowerDownLeft');
  const mouthLowerDownRight = get('mouthLowerDownRight');
  const mouthPressLeft = get('mouthPressLeft');
  const mouthPressRight = get('mouthPressRight');
  const jawOpen = get('jawOpen');
  
  // Pain grimace: downturned lips, lowered bottom lip, clenching or stretch
  const mouth = (
    mouthStretchLeft + mouthStretchRight +
    mouthFrownLeft * 2.0 + mouthFrownRight * 2.0 +
    mouthLowerDownLeft * 1.5 + mouthLowerDownRight * 1.5 +
    (mouthPressLeft + mouthPressRight) * 0.8 +
    jawOpen * 0.4
  ) / 6;

  const mouthSmileLeft = get('mouthSmileLeft');
  const mouthSmileRight = get('mouthSmileRight');
  const smile = (mouthSmileLeft + mouthSmileRight) / 2;

  return {
    brow,
    squint,
    nose,
    close: rawClose,
    close_sustained,
    mouth,
    smile,
    jawOpen,
  };
}

/**
 * Computes per-frame distress score against personal calm baseline
 */
export function evaluateDistressFrame(
  signals: FaceSignals,
  baseline: PersonalFaceBaseline = DEFAULT_FACE_BASELINE,
  headYawDeg: number = 0,
  headPitchDeg: number = 0
): DistressFrameAssessment {
  // Quality Gate: check head angle (must be within ~35 degrees)
  if (Math.abs(headYawDeg) > 35 || Math.abs(headPitchDeg) > 35) {
    return {
      score: 0,
      signals,
      deltas: {},
      qualityOk: false,
      qualityReason: "I can't see your face well. Please look towards the camera.",
      isSmileGuarded: false,
      isYawnGuarded: false,
    };
  }

  // Yawn guard: jawOpen > 0.6 is a yawn, ignore frame
  const isYawnGuarded = signals.jawOpen > 0.6;
  if (isYawnGuarded) {
    return {
      score: 0,
      signals,
      deltas: {},
      qualityOk: true,
      isSmileGuarded: false,
      isYawnGuarded: true,
    };
  }

  // Compute delta above personal baseline
  const delta = (curr: number, base: number) => Math.max(0, curr - base);

  let deltaBrow = delta(signals.brow, baseline.calm.brow);
  let deltaSquint = delta(signals.squint, baseline.calm.squint);
  let deltaNose = delta(signals.nose, baseline.calm.nose);
  let deltaClose = delta(signals.close_sustained, baseline.calm.close_sustained);
  let deltaMouth = delta(signals.mouth, baseline.calm.mouth);
  const deltaSmile = delta(signals.smile, baseline.calm.smile);

  // Smile guard: genuine smile raises cheeks; cancel squint if smiling
  let isSmileGuarded = false;
  if (deltaSmile > 0.25) {
    deltaSquint = Math.max(0, deltaSquint - deltaSmile);
    isSmileGuarded = true;
  }

  // Normalize deltas into 0..1 scale (scaled so subtle discomfort registers clearly)
  const norm = (v: number) => Math.min(1.0, Math.max(0, v * 3.4));

  const nBrow = norm(deltaBrow);
  const nSquint = norm(deltaSquint);
  const nNose = norm(deltaNose);
  const nClose = norm(deltaClose);
  const nMouth = norm(deltaMouth);

  // Weighted score from TONIGHT_SPEC section 3.3
  const score =
    0.28 * nBrow +
    0.24 * nSquint +
    0.18 * nNose +
    0.15 * nClose +
    0.15 * nMouth;

  return {
    score: Math.min(1.0, Math.max(0, score)),
    signals,
    deltas: {
      brow: nBrow,
      squint: nSquint,
      nose: nNose,
      close_sustained: nClose,
      mouth: nMouth,
      smile: deltaSmile,
    },
    qualityOk: true,
    isSmileGuarded,
    isYawnGuarded,
  };
}

/**
 * Stateful Distress Watch Analyzer
 * Tracks history over a sliding 60-second window, evaluates sustained levels, and enforces cooldowns.
 */
export class DistressWatchTracker {
  private baseline: PersonalFaceBaseline;
  private settings: DistressSettings;
  private history: { timestamp: number; assessment: DistressFrameAssessment }[] = [];
  private lastAlertTimestamp: number = 0;
  private blinkStartTime: number = 0;

  constructor(baseline?: PersonalFaceBaseline, settings?: Partial<DistressSettings>) {
    this.baseline = baseline || DEFAULT_FACE_BASELINE;
    this.settings = { ...DEFAULT_DISTRESS_SETTINGS, ...settings };
  }

  public updateBaseline(newBaseline: PersonalFaceBaseline) {
    this.baseline = newBaseline;
  }

  public updateSettings(newSettings: Partial<DistressSettings>) {
    this.settings = { ...this.settings, ...newSettings };
  }

  public updateSensitivity(verdict: 'needed_care' | 'false_alarm') {
    if (verdict === 'false_alarm') {
      // Increase threshold (less sensitive), max 0.65
      this.settings.thresholdLevel1 = Math.min(0.65, this.settings.thresholdLevel1 + 0.05);
    } else if (verdict === 'needed_care') {
      // Decrease threshold (more sensitive), min 0.35
      this.settings.thresholdLevel1 = Math.max(0.35, this.settings.thresholdLevel1 - 0.02);
    }
  }

  public resetSensitivity() {
    this.settings.thresholdLevel1 = DEFAULT_DISTRESS_SETTINGS.thresholdLevel1;
  }

  public resetCooldown() {
    this.lastAlertTimestamp = 0;
  }

  public processFrame(
    blendshapes: BlendshapeMap | null,
    now: number = Date.now(),
    headYawDeg: number = 0,
    headPitchDeg: number = 0
  ): DistressDecision {
    if (!this.settings.enabled || !blendshapes) {
      return this.buildEmptyDecision('Comfort watch disabled or no face visible');
    }

    // Check sustained blink duration
    const rawBlink = ((blendshapes['eyeBlinkLeft'] || 0) + (blendshapes['eyeBlinkRight'] || 0)) / 2;
    if (rawBlink > 0.6) {
      if (this.blinkStartTime === 0) this.blinkStartTime = now;
    } else {
      this.blinkStartTime = 0;
    }
    const sustainedBlinkSec = this.blinkStartTime > 0 ? (now - this.blinkStartTime) / 1000 : 0;

    const signals = extractFaceSignals(blendshapes, sustainedBlinkSec);
    const assessment = evaluateDistressFrame(signals, this.baseline, headYawDeg, headPitchDeg);

    // Keep up to 60 seconds of history
    this.history.push({ timestamp: now, assessment });
    const cutoff = now - 60000;
    this.history = this.history.filter((h) => h.timestamp >= cutoff);

    // Quality gate: if more than half of frames in window failed quality, show warning and send nothing
    const recentWindow = this.history.filter((h) => h.timestamp >= now - 10000);
    const badQualityCount = recentWindow.filter((h) => !h.assessment.qualityOk).length;
    if (recentWindow.length > 5 && badQualityCount > recentWindow.length * 0.5) {
      return this.buildEmptyDecision("I can't see your face well. Move a little closer or turn on a light.");
    }

    // Check cooldown
    const inCooldown = now - this.lastAlertTimestamp < this.settings.cooldownMs;

    // Check Level 1 window (8 seconds)
    const window8s = this.history.filter((h) => h.timestamp >= now - this.settings.durationSecLevel1 * 1000);
    const framesAboveThresh8s = window8s.filter((h) => h.assessment.score >= this.settings.thresholdLevel1);
    const ratio8s = window8s.length > 0 ? framesAboveThresh8s.length / window8s.length : 0;

    // Check fast intense expression window (last 1.5 seconds)
    const window2s = this.history.filter((h) => h.timestamp >= now - 1500);
    const framesVeryHigh2s = window2s.filter((h) => h.assessment.score >= 0.45);
    const ratio2s = window2s.length > 0 ? framesVeryHigh2s.length / window2s.length : 0;
    const isInstantHighPain = window2s.length >= 3 && ratio2s >= 0.60;

    // Core groups check: at least 2 of the 4 core groups (brow, squint, nose, close) raised
    const d = assessment.deltas;
    const activeSignals = {
      brow: (d.brow || 0) >= 0.16,
      squint: (d.squint || 0) >= 0.16,
      nose: (d.nose || 0) >= 0.14,
      close: (d.close_sustained || 0) >= 0.18,
    };
    const raisedCoreCount = Object.values(activeSignals).filter(Boolean).length;

    const isLevel1 =
      (ratio8s >= this.settings.ratioFramesAbove && raisedCoreCount >= 2 && window8s.length >= 8) ||
      isInstantHighPain;

    // Check Level 2 window (20 seconds)
    const window20s = this.history.filter((h) => h.timestamp >= now - this.settings.durationSecLevel2 * 1000);
    const framesAboveThresh20s = window20s.filter((h) => h.assessment.score >= this.settings.thresholdLevel1);
    const ratio20s = window20s.length > 0 ? framesAboveThresh20s.length / window20s.length : 0;
    const isLevel2 = isLevel1 && ratio20s >= this.settings.ratioFramesAbove && window20s.length >= 20;

    let level: 0 | 1 | 2 = 0;
    let shouldTrigger = false;
    let statusText = 'Face looks comfortable';

    if (isLevel2) {
      level = 2;
      statusText = 'Needs a check now';
      if (!inCooldown) {
        shouldTrigger = true;
        this.lastAlertTimestamp = now;
      }
    } else if (isLevel1) {
      level = 1;
      statusText = isInstantHighPain ? 'Looks uncomfortable' : 'May need a check';
      if (!inCooldown) {
        shouldTrigger = true;
        this.lastAlertTimestamp = now;
      }
    }

    // Generate 60-second sparkline history
    const sparkline = this.generateSparkline(now);

    return {
      level,
      score: assessment.score,
      durationSec: isLevel2 ? 20 : isLevel1 ? 8 : 0,
      activeSignals,
      raisedCoreCount,
      recentScores: sparkline,
      statusText,
      shouldTriggerAlert: shouldTrigger,
    };
  }

  private generateSparkline(now: number): number[] {
    const buckets: number[] = new Array(60).fill(0);
    for (let i = 0; i < 60; i++) {
      const bucketEnd = now - (59 - i) * 1000;
      const bucketStart = bucketEnd - 1000;
      const samples = this.history.filter((h) => h.timestamp >= bucketStart && h.timestamp < bucketEnd);
      if (samples.length > 0) {
        const avg = samples.reduce((acc, s) => acc + s.assessment.score, 0) / samples.length;
        buckets[i] = Math.round(avg * 100) / 100;
      }
    }
    return buckets;
  }

  private buildEmptyDecision(statusText: string): DistressDecision {
    return {
      level: 0,
      score: 0,
      durationSec: 0,
      activeSignals: { brow: false, squint: false, nose: false, close: false },
      raisedCoreCount: 0,
      recentScores: new Array(60).fill(0),
      statusText,
      shouldTriggerAlert: false,
    };
  }
}
