import { ComfortScore, GestureCoachWarning, GestureDefinition, Point2D } from './types';
import { featureDistance } from './knn';

/**
 * Analyzes stored gesture profile to give feedback on similarity, comfort, and 2D visual scatter points
 */

export function analyzeGestureProfile(
  gestures: GestureDefinition[],
  restSamples: number[][] = []
): {
  warnings: GestureCoachWarning[];
  comfortScores: ComfortScore[];
  movementMap: Point2D[];
} {
  const warnings: GestureCoachWarning[] = [];
  const comfortScores: ComfortScore[] = [];
  const movementMap: Point2D[] = [];

  // 1. Gesture Similarity & Warnings (pairwise comparison)
  for (let i = 0; i < gestures.length; i++) {
    for (let j = i + 1; j < gestures.length; j++) {
      const gA = gestures[i];
      const gB = gestures[j];

      // Calculate mean distance between gA samples and gB samples
      let totalDist = 0;
      let count = 0;
      gA.samples.forEach((sA) => {
        gB.samples.forEach((sB) => {
          totalDist += featureDistance(sA, sB);
          count++;
        });
      });

      const meanDist = count > 0 ? totalDist / count : 1.0;
      // Similarity metric from 0 to 1
      const similarity = Math.max(0, Math.min(1, 1 - meanDist / 1.5));

      if (similarity > 0.65) {
        warnings.push({
          gestureA: gA.label,
          gestureB: gB.label,
          similarity,
          message: `"${gA.label}" and "${gB.label}" look alike. Try a different movement for one of them.`,
        });
      }
    }
  }

  // 2. Comfort Scores based on sample variance
  gestures.forEach((g) => {
    if (g.samples.length < 2) {
      comfortScores.push({
        gestureId: g.id,
        label: g.label,
        score: 'Easy for you',
        variance: 0.1,
      });
      return;
    }

    // Calculate variance from mean sample
    const numFeatures = g.samples[0].length;
    const meanVec = new Array(numFeatures).fill(0);

    g.samples.forEach((sample) => {
      sample.forEach((val, idx) => {
        meanVec[idx] += val / g.samples.length;
      });
    });

    let totalVariance = 0;
    g.samples.forEach((sample) => {
      totalVariance += featureDistance(sample, meanVec);
    });

    const avgVariance = totalVariance / g.samples.length;
    const score = avgVariance > 0.45 ? 'Might be tiring' : 'Easy for you';

    comfortScores.push({
      gestureId: g.id,
      label: g.label,
      score,
      variance: avgVariance,
    });
  });

  // 3. 2D Movement Map Scatter Projection (Simplified PCA / 2D projection)
  gestures.forEach((g) => {
    g.samples.forEach((sample) => {
      // Use index tip position relative to wrist (feat 63 and feat 64, or X/Y of tip)
      const x = sample.length > 24 ? sample[24] : sample[0]; // Pt 8 X
      const y = sample.length > 25 ? sample[25] : sample[1]; // Pt 8 Y
      movementMap.push({
        x: Number((x * 100).toFixed(1)),
        y: Number((y * 100).toFixed(1)),
        label: g.label,
        kind: 'gesture',
      });
    });
  });

  restSamples.forEach((sample) => {
    const x = sample.length > 24 ? sample[24] : sample[0];
    const y = sample.length > 25 ? sample[25] : sample[1];
    movementMap.push({
      x: Number((x * 100).toFixed(1)),
      y: Number((y * 100).toFixed(1)),
      label: 'Rest',
      kind: 'rest',
    });
  });

  return { warnings, comfortScores, movementMap };
}
