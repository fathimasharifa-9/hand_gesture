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

    // Frame 1-2: CANDIDATE state building
    for (let i = 0; i < 2; i++) {
      const res = sm.processFrame(matchWater, 1000 + i * 20);
      expect(res.state).toBe('CANDIDATE');
      expect(res.shouldSendRequest).toBe(false);
    }

    // Frame 3: Moves to HOLDING
    const res3 = sm.processFrame(matchWater, 1060);
    expect(res3.state).toBe('HOLDING');

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

  // Test 6: Two-Hand Support & Hand Mirroring
  it('should support recognition across either hand (left or right)', () => {
    // Generate asymmetric right hand landmarks
    const rightHandRaw: Landmark[] = Array.from({ length: 21 }, (_, i) => ({
      x: i * 0.05 + 0.1,
      y: (i % 4) * 0.1,
      z: 0.02,
    }));

    // Mirroring left hand landmarks (inverted x)
    const leftHandRaw: Landmark[] = rightHandRaw.map((pt) => ({
      x: -pt.x + 0.2,
      y: pt.y,
      z: pt.z,
    }));

    // Normalize right hand as normal, and left hand with isLeftHand=true
    const normRight = normalizeLandmarks(rightHandRaw, false, true);
    const normLeft = normalizeLandmarks(leftHandRaw, true, true);

    const featRight = extractPoseFeatures(normRight);
    const featLeft = extractPoseFeatures(normLeft);

    const gesture: GestureDefinition = {
      id: 'g_two_hand',
      label: 'Water',
      priority: 'normal',
      kind: 'pose',
      samples: [featRight],
      createdAt: Date.now(),
    };

    // Right hand matches trained gesture
    const resRight = classifyGesture(featRight, [gesture], []);
    expect(resRight.label).toBe('Water');

    // Left hand with mirroring produces close feature distance
    const dist = Math.abs(resRight.confidence - classifyGesture(featLeft, [gesture], []).confidence);
    expect(dist).toBeLessThan(0.4);
  });
});

