import { ClassificationResult, GestureDefinition, PriorityLevel } from './types';

/**
 * Calculates Euclidean distance between two feature vectors
 */
export function featureDistance(v1: number[], v2: number[]): number {
  let sumSq = 0;
  const len = Math.min(v1.length, v2.length);
  for (let i = 0; i < len; i++) {
    const diff = v1[i] - v2[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq);
}

/**
 * Calculates internal spread (average distance between sample pairs) for a set of feature samples
 * With a robust adaptive floor so real-world hand variations don't artificially collapse confidence.
 */
export function calculateSampleSpread(samples: number[][]): number {
  if (!samples || samples.length < 2) return 0.75;
  let totalDist = 0;
  let count = 0;

  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      totalDist += featureDistance(samples[i], samples[j]);
      count++;
    }
  }

  const avgDist = count > 0 ? totalDist / count : 0.75;
  return Math.max(0.6, avgDist);
}

export interface StoredSample {
  gestureId: string | null; // null for rest sample
  label: string;
  priority?: PriorityLevel;
  features: number[];
  isRest: boolean;
}

/**
 * k-Nearest-Neighbors (k=3) Classifier with Rest Class support
 * Per BUILD_SPEC Step D: If the closest sample is from the Rest class, return Rest (do nothing).
 */
export function classifyGesture(
  inputFeatures: number[],
  gestures: GestureDefinition[],
  restSamples: number[][] = [],
  k: number = 3
): ClassificationResult {
  const allStoredSamples: StoredSample[] = [];

  // 1. Add rest samples
  restSamples.forEach((feat) => {
    allStoredSamples.push({
      gestureId: null,
      label: 'REST',
      features: feat,
      isRest: true,
    });
  });

  // 2. Add gesture request samples
  gestures.forEach((g) => {
    g.samples.forEach((feat) => {
      allStoredSamples.push({
        gestureId: g.id,
        label: g.label,
        priority: g.priority,
        features: feat,
        isRest: false,
      });
    });
  });

  if (allStoredSamples.length === 0) {
    return {
      label: null,
      gestureId: null,
      confidence: 0,
      margin: 0,
      isRest: true,
      isUnsure: true,
      nearestDistance: Infinity,
    };
  }

  // Calculate distance from input to every stored sample
  const distances = allStoredSamples.map((sample) => ({
    sample,
    dist: featureDistance(inputFeatures, sample.features),
  }));

  distances.sort((a, b) => a.dist - b.dist);

  const nearestSample = distances[0];

  // 1. BUILD_SPEC RULE: If closest sample is a REST sample -> Return REST (nothing)
  if (nearestSample.sample.isRest) {
    return {
      label: null,
      gestureId: null,
      confidence: 0,
      margin: 0,
      isRest: true,
      isUnsure: false,
      nearestDistance: nearestSample.dist,
    };
  }

  // Group top distances by gesture ID
  const gestureScores: Map<
    string,
    { label: string; priority?: PriorityLevel; distances: number[]; spread: number }
  > = new Map();

  gestures.forEach((g) => {
    const spread = calculateSampleSpread(g.samples);
    gestureScores.set(g.id, {
      label: g.label,
      priority: g.priority,
      distances: [],
      spread,
    });
  });

  distances.forEach(({ sample, dist }) => {
    if (!sample.isRest && sample.gestureId) {
      const entry = gestureScores.get(sample.gestureId);
      if (entry && entry.distances.length < k) {
        entry.distances.push(dist);
      }
    }
  });

  const rankedResults: {
    gestureId: string;
    label: string;
    priority?: PriorityLevel;
    confidence: number;
    avgDist: number;
  }[] = [];

  gestureScores.forEach((data, gestureId) => {
    if (data.distances.length > 0) {
      const avgDist = data.distances.reduce((a, b) => a + b, 0) / data.distances.length;
      const normalizedRatio = avgDist / (2.2 * data.spread);
      const confidence = Math.max(0, Math.min(1.0, Math.exp(-normalizedRatio * normalizedRatio)));

      rankedResults.push({
        gestureId,
        label: data.label,
        priority: data.priority,
        confidence,
        avgDist,
      });
    }
  });

  rankedResults.sort((a, b) => b.confidence - a.confidence);

  if (rankedResults.length === 0) {
    return {
      label: null,
      gestureId: null,
      confidence: 0,
      margin: 0,
      isRest: true,
      isUnsure: true,
      nearestDistance: nearestSample.dist,
    };
  }

  const best = rankedResults[0];
  const secondBestConf = rankedResults.length > 1 ? rankedResults[1].confidence : 0;
  const margin = Math.max(0, best.confidence - secondBestConf);

  return {
    label: best.label,
    gestureId: best.gestureId,
    confidence: best.confidence,
    margin,
    isRest: false,
    isUnsure: false,
    nearestDistance: best.avgDist,
  };
}
