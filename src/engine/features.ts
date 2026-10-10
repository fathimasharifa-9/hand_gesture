import { Landmark } from './types';

/**
 * Calculates Euclidean distance between two 3D points
 */
export function euclideanDistance(p1: Landmark, p2: Landmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = p1.z - p2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculates angle (in radians) between vectors (A -> B) and (B -> C)
 */
export function calculateJointAngle(pA: Landmark, pB: Landmark, pC: Landmark): number {
  const v1 = { x: pA.x - pB.x, y: pA.y - pB.y, z: pA.z - pB.z };
  const v2 = { x: pC.x - pB.x, y: pC.y - pB.y, z: pC.z - pB.z };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z) || 1.0;
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z) || 1.0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosAngle);
}

/**
 * Extracts a 73-dimensional feature vector for a static pose:
 * - 63 normalized coordinates (21 * 3)
 * - 5 fingertip-to-wrist distances
 * - 5 finger bend angles
 */
export function extractPoseFeatures(normalizedLandmarks: Landmark[]): number[] {
  if (!normalizedLandmarks || normalizedLandmarks.length < 21) {
    return new Array(73).fill(0);
  }

  const coords: number[] = [];
  normalizedLandmarks.forEach((pt) => {
    coords.push(pt.x, pt.y, pt.z);
  });

  const wrist = normalizedLandmarks[0];
  const tipIndices = [4, 8, 12, 16, 20];
  const tipDistances = tipIndices.map((idx) => euclideanDistance(normalizedLandmarks[idx], wrist));

  // Finger joints: MCP -> PIP -> TIP
  const fingerJoints = [
    [2, 3, 4],   // Thumb
    [5, 6, 8],   // Index
    [9, 10, 12], // Middle
    [13, 14, 16],// Ring
    [17, 18, 20] // Pinky
  ];

  const bendAngles = fingerJoints.map(([a, b, c]) =>
    calculateJointAngle(normalizedLandmarks[a], normalizedLandmarks[b], normalizedLandmarks[c])
  );

  return [...coords, ...tipDistances, ...bendAngles];
}

/**
 * Extracts motion trajectory features over a sequence of frames
 */
export function extractMoveFeatures(frameSequence: Landmark[][]): number[] {
  if (!frameSequence || frameSequence.length === 0) {
    return new Array(33).fill(0);
  }

  // Extract palm center (average of landmarks 0, 5, 9, 13, 17) for each frame
  const trajectory: { x: number; y: number }[] = frameSequence.map((frame) => {
    if (!frame || frame.length < 21) return { x: 0, y: 0 };
    const wrist = frame[0];
    const indexMcp = frame[5];
    const middleMcp = frame[9];
    return {
      x: (wrist.x + indexMcp.x + middleMcp.x) / 3,
      y: (wrist.y + indexMcp.y + middleMcp.y) / 3,
    };
  });

  const firstPt = trajectory[0];
  const centered = trajectory.map((pt) => ({
    x: pt.x - firstPt.x,
    y: pt.y - firstPt.y,
  }));

  // Resample trajectory to exactly 16 points
  const resampled: { x: number; y: number }[] = [];
  const totalFrames = centered.length;

  for (let i = 0; i < 16; i++) {
    const idx = Math.min(totalFrames - 1, Math.floor((i / 15) * (totalFrames - 1)));
    resampled.push(centered[idx]);
  }

  // Calculate total path distance / speed
  let totalDistance = 0;
  for (let i = 1; i < centered.length; i++) {
    const dx = centered[i].x - centered[i - 1].x;
    const dy = centered[i].y - centered[i - 1].y;
    totalDistance += Math.sqrt(dx * dx + dy * dy);
  }
  const avgSpeed = totalDistance / (totalFrames || 1);

  const flattened: number[] = [];
  resampled.forEach((pt) => flattened.push(pt.x, pt.y));
  flattened.push(avgSpeed);

  return flattened;
}
