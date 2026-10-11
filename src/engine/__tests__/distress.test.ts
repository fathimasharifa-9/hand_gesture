import { describe, it, expect } from 'vitest';
import {
  extractFaceSignals,
  evaluateDistressFrame,
  DistressWatchTracker,
  DEFAULT_FACE_BASELINE,
} from '../distress';

describe('Distress Watch Engine', () => {
  it('extractFaceSignals groups blendshapes correctly', () => {
    const blendshapes = {
      browDownLeft: 0.4,
      browDownRight: 0.6,
      eyeSquintLeft: 0.3,
      eyeSquintRight: 0.5,
      cheekSquintLeft: 0.4,
      cheekSquintRight: 0.4,
      noseSneerLeft: 0.5,
      noseSneerRight: 0.5,
      mouthUpperUpLeft: 0.3,
      mouthUpperUpRight: 0.3,
      eyeBlinkLeft: 0.8,
      eyeBlinkRight: 0.8,
      mouthStretchLeft: 0.2,
      mouthStretchRight: 0.2,
      jawOpen: 0.2,
      mouthSmileLeft: 0.1,
      mouthSmileRight: 0.1,
    };

    const signals = extractFaceSignals(blendshapes, 0.6);
    expect(signals.brow).toBeCloseTo(0.5);
    expect(signals.squint).toBeCloseTo(0.4);
    expect(signals.nose).toBeCloseTo(0.4);
    expect(signals.close_sustained).toBeCloseTo(0.8);
    expect(signals.smile).toBeCloseTo(0.1);
  });

  it('calm face scores near 0 against baseline', () => {
    const signals = {
      brow: 0.05,
      squint: 0.05,
      nose: 0.03,
      close: 0.05,
      close_sustained: 0.05,
      mouth: 0.05,
      smile: 0.05,
      jawOpen: 0.05,
    };

    const assessment = evaluateDistressFrame(signals, DEFAULT_FACE_BASELINE);
    expect(assessment.qualityOk).toBe(true);
    expect(assessment.score).toBeLessThan(0.1);
  });

  it('smile guard neutralizes squint part', () => {
    const smilingFace = {
      brow: 0.05,
      squint: 0.6, // squint lifted by smiling cheeks
      nose: 0.03,
      close: 0.05,
      close_sustained: 0.0,
      mouth: 0.1,
      smile: 0.7, // big smile
      jawOpen: 0.2,
    };

    const assessment = evaluateDistressFrame(smilingFace, DEFAULT_FACE_BASELINE);
    expect(assessment.isSmileGuarded).toBe(true);
    expect(assessment.score).toBeLessThan(0.2); // suppressed by smile guard
  });

  it('yawn guard drops score to 0 when mouth is wide open', () => {
    const yawningFace = {
      brow: 0.4,
      squint: 0.4,
      nose: 0.4,
      close: 0.8,
      close_sustained: 0.8,
      mouth: 0.7,
      smile: 0.0,
      jawOpen: 0.85, // yawning wide
    };

    const assessment = evaluateDistressFrame(yawningFace, DEFAULT_FACE_BASELINE);
    expect(assessment.isYawnGuarded).toBe(true);
    expect(assessment.score).toBe(0);
  });

  it('quality gate rejects face turned more than 35 degrees', () => {
    const turnedFace = {
      brow: 0.6,
      squint: 0.6,
      nose: 0.6,
      close: 0.8,
      close_sustained: 0.8,
      mouth: 0.5,
      smile: 0.0,
      jawOpen: 0.1,
    };

    const assessment = evaluateDistressFrame(turnedFace, DEFAULT_FACE_BASELINE, 42, 0); // 42 deg yaw
    expect(assessment.qualityOk).toBe(false);
    expect(assessment.score).toBe(0);
  });

  it('DistressWatchTracker adapts sensitivity based on caregiver feedback', () => {
    const tracker = new DistressWatchTracker(DEFAULT_FACE_BASELINE, { enabled: true });

    // False alarm -> raises threshold
    tracker.updateSensitivity('false_alarm');
    // @ts-ignore
    expect(tracker['settings'].thresholdLevel1).toBeCloseTo(0.50);

    // Needed care -> lowers threshold
    tracker.updateSensitivity('needed_care');
    // @ts-ignore
    expect(tracker['settings'].thresholdLevel1).toBeCloseTo(0.48);

    tracker.resetSensitivity();
    // @ts-ignore
    expect(tracker['settings'].thresholdLevel1).toBeCloseTo(0.45);
  });
});
