import { describe, it, expect } from 'vitest';
import { validateSingleSample, validateTrainingSession, computeCentroid } from '../validation';
import { GestureDefinition } from '../types';

describe('Gesture Training Validation', () => {
  // Helper to generate synthetic feature vector
  function makeSample(baseVal: number, noise: number = 0): number[] {
    const v = new Array(73).fill(0);
    for (let i = 0; i < 73; i++) {
      v[i] = baseVal + (Math.sin(i) * 0.1) + noise;
    }
    return v;
  }

  it('computes centroid correctly', () => {
    const s1 = new Array(73).fill(1);
    const s2 = new Array(73).fill(3);
    const centroid = computeCentroid([s1, s2]);
    expect(centroid[0]).toBe(2);
    expect(centroid[72]).toBe(2);
  });

  it('accepts consistent samples for the same gesture', () => {
    const baseline = [makeSample(1.0, 0.01), makeSample(1.0, -0.01), makeSample(1.0, 0.02)];
    const newConsistent = makeSample(1.0, 0.03);

    const res = validateSingleSample(newConsistent, baseline);
    expect(res.isValid).toBe(true);
    expect(res.similarityScore).toBeGreaterThan(0.7);
  });

  it('rejects an inconsistent sample from a completely different gesture', () => {
    const baseline = [makeSample(1.0, 0.01), makeSample(1.0, -0.01), makeSample(1.0, 0.02)];
    // Completely different gesture (e.g. fist vs open palm) with large feature shift
    const differentGesture = makeSample(3.5, 0.0);

    const res = validateSingleSample(differentGesture, baseline);
    expect(res.isValid).toBe(false);
    expect(res.reason).toMatch(/differs significantly/i);
  });

  it('rejects a sample too close to the rest/neutral baseline', () => {
    const rest = [makeSample(0.1, 0.01), makeSample(0.1, -0.01)];
    const candidateRest = makeSample(0.1, 0.02);

    const res = validateSingleSample(candidateRest, [makeSample(2.0)], rest);
    expect(res.isValid).toBe(false);
    expect(res.reason).toMatch(/resting or neutral position/i);
  });

  it('validates a consistent training session across 15 samples', () => {
    const samples = [];
    for (let i = 0; i < 15; i++) {
      samples.push(makeSample(1.0, (i - 7) * 0.02));
    }

    const sessionRes = validateTrainingSession(samples);
    expect(sessionRes.isValid).toBe(true);
    expect(sessionRes.consistencyScore).toBeGreaterThan(70);
    expect(sessionRes.validSamples.length).toBe(15);
  });

  it('rejects an inconsistent training session where user switched gestures mid-session', () => {
    const samples = [];
    // 7 samples of gesture A
    for (let i = 0; i < 7; i++) {
      samples.push(makeSample(1.0, i * 0.01));
    }
    // 8 samples of a completely different gesture B
    for (let i = 0; i < 8; i++) {
      samples.push(makeSample(3.5, i * 0.01));
    }

    const sessionRes = validateTrainingSession(samples);
    // The second half will be rejected by single sample validation, leaving < 8 valid samples,
    // or overall spread will be marked inconsistent!
    expect(sessionRes.isValid).toBe(false);
    expect(sessionRes.warning).toMatch(/inconsistent|repeat the SAME gesture/i);
  });

  it('detects ambiguity if a newly trained gesture is too similar to an existing gesture', () => {
    const existingSamples = [makeSample(1.0, 0.01), makeSample(1.0, 0.02)];
    const existingGestures: GestureDefinition[] = [
      {
        id: 'g_water',
        label: 'WATER',
        priority: 'normal',
        kind: 'pose',
        samples: existingSamples,
        createdAt: Date.now(),
      },
    ];

    // New candidate samples that are almost identical to existing WATER
    const newSamples = [makeSample(1.02, 0.01), makeSample(1.01, -0.01), makeSample(1.02, 0.0)];
    for (let i = 0; i < 8; i++) {
      newSamples.push(makeSample(1.01, (i - 4) * 0.01));
    }

    const sessionRes = validateTrainingSession(newSamples, [], existingGestures, 'HELP');
    expect(sessionRes.isValid).toBe(false);
    expect(sessionRes.warning).toMatch(/too similar to "WATER"/i);
    expect(sessionRes.ambiguousWith?.label).toBe('WATER');
  });
});
