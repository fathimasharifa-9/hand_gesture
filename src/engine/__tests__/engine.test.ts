import { describe, it, expect } from 'vitest';
import { normalizeLandmarks } from '../normalize';
import { extractPoseFeatures, euclideanDistance } from '../features';
import { classifyGesture } from '../knn';
import { DecisionStateMachine } from '../stateMachine';
import { analyzeGestureProfile } from '../coach';
import { GestureDefinition, Landmark } from '../types';

describe('REACH Gesture Engine Unit Tests', () => {

  // Test 1: Normalization
  it('should normalize 21 hand landmarks relative to wrist and scale', () => {
    const mockRaw: Landmark[] = Array.from({ length: 21 }, (_, i) => ({
      x: i * 10,
      y: i * 20,
      z: 0,
    }));

    const normalized = normalizeLandmarks(mockRaw, false, true);
    expect(normalized).toHaveLength(21);
    // Wrist point 0 should be at origin (0, 0, 0)
    expect(normalized[0].x).toBeCloseTo(0, 5);
    expect(normalized[0].y).toBeCloseTo(0, 5);
  });

  // Test 2: Feature Extraction
  it('should extract 73-dimensional pose feature vector', () => {
    const mockLandmarks: Landmark[] = Array.from({ length: 21 }, (_, i) => ({
      x: (i % 5) * 0.1,
      y: Math.floor(i / 5) * 0.1,
      z: 0.05,
    }));

    const features = extractPoseFeatures(mockLandmarks);
    expect(features).toHaveLength(73); // 63 coords + 5 tip dists + 5 bend angles
  });

  // Test 3: kNN Classification & Rest Hand Rejection
  it('should classify gestures accurately and reject rest hand samples', () => {
    // Mock samples for "Water" (all 1s) and "Pain" (all 5s)
    const waterSample1 = new Array(73).fill(1.0);
    const waterSample2 = new Array(73).fill(1.1);
    const waterSample3 = new Array(73).fill(0.9);

    const painSample1 = new Array(73).fill(5.0);
    const painSample2 = new Array(73).fill(5.1);

    const restSample = new Array(73).fill(0.0);

    const gestures: GestureDefinition[] = [
      {
        id: 'g_water',
        label: 'Water',
        priority: 'normal',
        kind: 'pose',
        samples: [waterSample1, waterSample2, waterSample3],
        createdAt: Date.now(),
      },
      {
        id: 'g_pain',
        label: 'Pain',
        priority: 'urgent',
        kind: 'pose',
        samples: [painSample1, painSample2],
        createdAt: Date.now(),
      },
    ];

    // Test A: Input close to Water -> Should classify as Water
    const testInputWater = new Array(73).fill(1.01);
    const resultWater = classifyGesture(testInputWater, gestures, [restSample]);
    expect(resultWater.label).toBe('Water');
    expect(resultWater.confidence).toBeGreaterThan(0.8);
    expect(resultWater.isRest).toBe(false);

    // Test B: Input close to Rest -> Should return isRest: true
    const testInputRest = new Array(73).fill(0.01);
    const resultRest = classifyGesture(testInputRest, gestures, [restSample]);
    expect(resultRest.isRest).toBe(true);
    expect(resultRest.label).toBeNull();
  });

  // Test 4: Decision State Machine
  it('should transition through candidate, holding, and cooldown states', () => {
    const sm = new DecisionStateMachine({ holdMs: 200, minConfidence: 0.7, minMargin: 0.1 });

    const matchWater = {
      label: 'Water',
      gestureId: 'g_water',
      confidence: 0.9,
      margin: 0.4,
      isRest: false,
      isUnsure: false,
      nearestDistance: 0.1,
      priority: 'normal' as const,
    };

    // Frame 1-4: CANDIDATE state building
    for (let i = 0; i < 4; i++) {
      const res = sm.processFrame(matchWater, 1000 + i * 20);
      expect(res.state).toBe('CANDIDATE');
      expect(res.shouldSendRequest).toBe(false);
    }

    // Frame 5: Moves to HOLDING
    const res5 = sm.processFrame(matchWater, 1100);
    expect(res5.state).toBe('HOLDING');

    // Frame 6: Hold duration complete (holdMs = 200) -> Transitions to SENT
    const res6 = sm.processFrame(matchWater, 1350);
    expect(res6.state).toBe('SENT');
    expect(res6.shouldSendRequest).toBe(true);
    expect(res6.matchedLabel).toBe('Water');
  });

  // Test 5: Gesture Coach Similarity Warning
  it('should flag gestures that are too similar', () => {
    const sample1 = new Array(73).fill(1.0);
    const sampleSimilar = new Array(73).fill(1.02);

    const gestures: GestureDefinition[] = [
      { id: '1', label: 'Water', priority: 'normal', kind: 'pose', samples: [sample1], createdAt: Date.now() },
      { id: '2', label: 'Pain', priority: 'urgent', kind: 'pose', samples: [sampleSimilar], createdAt: Date.now() },
    ];

    const analysis = analyzeGestureProfile(gestures, []);
    expect(analysis.warnings.length).toBeGreaterThan(0);
    expect(analysis.warnings[0].message).toContain('look alike');
  });
});
