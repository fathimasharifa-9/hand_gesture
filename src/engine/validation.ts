import { Landmark, GestureDefinition, PriorityLevel } from './types';
import { featureDistance, calculateSampleSpread } from './knn';

export interface SampleValidationResult {
  isValid: boolean;
  reason?: string;
  distanceToCentroid: number;
  similarityScore: number; // 0.0 to 1.0
}

export interface SessionValidationResult {
  isValid: boolean;
  validSamples: number[][];
  rejectedSamples: number[][];
  spread: number;
  consistencyScore: number; // 0 to 100%
  warning?: string;
  ambiguousWith?: {
    label: string;
    distance: number;
  };
}

/**
 * Computes mean feature vector (centroid) of an array of feature samples
 */
export function computeCentroid(samples: number[][]): number[] {
  if (!samples || samples.length === 0) return [];
  const dim = samples[0].length;
  const centroid = new Array(dim).fill(0);

  for (const s of samples) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += s[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= samples.length;
  }

  return centroid;
}

/**
 * Validates a single incoming sample against already accepted samples for this gesture
 * and against the rest/neutral baseline.
 */
export function validateSingleSample(
  sample: number[],
  acceptedSamples: number[][],
  restSamples: number[][] = [],
  maxDistanceThreshold: number = 1.35
): SampleValidationResult {
  // 1. Check if sample is valid shape
  if (!sample || sample.length < 73) {
    return {
      isValid: false,
      reason: 'Incomplete hand landmark data.',
      distanceToCentroid: Infinity,
      similarityScore: 0,
    };
  }

  // 2. Check if sample is too close to rest baseline
  if (restSamples.length > 0) {
    const restCentroid = computeCentroid(restSamples);
    const distToRest = featureDistance(sample, restCentroid);
    if (distToRest < 0.45) {
      return {
        isValid: false,
        reason: 'Hand is in resting or neutral position. Please form a clear gesture.',
        distanceToCentroid: distToRest,
        similarityScore: 0,
      };
    }
  }

  // If first few samples, accept as baseline seed
  if (acceptedSamples.length < 3) {
    return {
      isValid: true,
      distanceToCentroid: 0,
      similarityScore: 1.0,
    };
  }

  // Compute distance to running centroid of accepted samples
  const centroid = computeCentroid(acceptedSamples);
  const dist = featureDistance(sample, centroid);

  // If distance exceeds threshold, reject
  if (dist > maxDistanceThreshold) {
    const similarity = Math.max(0, 1 - dist / (maxDistanceThreshold * 1.5));
    return {
      isValid: false,
      reason: 'Pose differs significantly from the gesture being trained.',
      distanceToCentroid: dist,
      similarityScore: similarity,
    };
  }

  const similarity = Math.max(0, Math.min(1.0, 1 - dist / (maxDistanceThreshold * 1.2)));
  return {
    isValid: true,
    distanceToCentroid: dist,
    similarityScore: similarity,
  };
}

/**
 * Validates the entire set of training samples collected during a training session.
 * Rejects inconsistent sessions where the user switched hand poses.
 */
export function validateTrainingSession(
  collectedSamples: number[][],
  restSamples: number[][] = [],
  existingGestures: GestureDefinition[] = [],
  currentGestureLabel?: string
): SessionValidationResult {
  if (!collectedSamples || collectedSamples.length === 0) {
    return {
      isValid: false,
      validSamples: [],
      rejectedSamples: [],
      spread: 0,
      consistencyScore: 0,
      warning: 'No hand samples were captured. Please keep your hand in view.',
    };
  }

  const validSamples: number[][] = [];
  const rejectedSamples: number[][] = [];

  // Progressive filtering
  for (const s of collectedSamples) {
    const res = validateSingleSample(s, validSamples, restSamples, 1.40);
    if (res.isValid) {
      validSamples.push(s);
    } else {
      rejectedSamples.push(s);
    }
  }

  if (validSamples.length < 8) {
    return {
      isValid: false,
      validSamples,
      rejectedSamples,
      spread: 0,
      consistencyScore: 0,
      warning: 'Too few consistent samples captured. Please repeat the SAME gesture.',
    };
  }

  // Compute pairwise spread among valid samples
  const spread = calculateSampleSpread(validSamples);

  // Consistency score: spread < 0.6 is 95-100%, 0.6-0.9 is 75-94%, 0.9-1.15 is 55-74%, >1.2 is <50%
  const consistencyScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (Math.max(0, spread - 0.5) / 1.4) * 100))
  );

  // Check if overall spread indicates inconsistent gesture
  if (spread > 1.20) {
    return {
      isValid: false,
      validSamples,
      rejectedSamples,
      spread,
      consistencyScore,
      warning: 'Your gestures are inconsistent. Please repeat the SAME gesture.',
    };
  }

  // Inter-gesture ambiguity check against existing gestures of the same patient
  const centroid = computeCentroid(validSamples);
  let ambiguousWith: { label: string; distance: number } | undefined;

  for (const g of existingGestures) {
    if (currentGestureLabel && g.label.toLowerCase() === currentGestureLabel.toLowerCase()) {
      continue; // Skip self when retraining
    }
    if (g.samples && g.samples.length > 0) {
      const gCentroid = computeCentroid(g.samples);
      const d = featureDistance(centroid, gCentroid);
      if (d < 0.70) {
        ambiguousWith = { label: g.label, distance: d };
        break;
      }
    }
  }

  if (ambiguousWith) {
    return {
      isValid: false,
      validSamples,
      rejectedSamples,
      spread,
      consistencyScore,
      warning: `This gesture is physically too similar to "${ambiguousWith.label}". Please choose a more distinct hand pose.`,
      ambiguousWith,
    };
  }

  return {
    isValid: true,
    validSamples,
    rejectedSamples,
    spread,
    consistencyScore,
  };
}
