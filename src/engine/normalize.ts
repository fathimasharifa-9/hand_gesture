import { Landmark } from './types';

/**
 * Normalizes 21 3D hand landmarks:
 * 1. Subtracts wrist position (landmark 0)
 * 2. Scales coordinates by the wrist-to-middle-knuckle distance (0 to 9)
 * 3. Rotates hand so wrist-to-middle-knuckle vector points straight up (0, -1) if ignoreTilt is true
 * 4. Mirrors left hand x-coordinates so left/right hands share a single profile
 */
export function normalizeLandmarks(
  rawLandmarks: Landmark[],
  isLeftHand: boolean = false,
  ignoreTilt: boolean = true
): Landmark[] {
  if (!rawLandmarks || rawLandmarks.length < 21) {
    return [];
  }

  const wrist = rawLandmarks[0];
  const middleKnuckle = rawLandmarks[9];

  // 1. Subtract wrist
  const centered = rawLandmarks.map((pt) => ({
    x: pt.x - wrist.x,
    y: pt.y - wrist.y,
    z: pt.z - wrist.z,
  }));

  // 2. Scale factor: wrist (0) to middle knuckle (9) distance
  const dx = centered[9].x;
  const dy = centered[9].y;
  const dz = centered[9].z;
  const scale = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1.0;

  const scaled = centered.map((pt) => ({
    x: pt.x / scale,
    y: pt.y / scale,
    z: pt.z / scale,
  }));

  // 3. Mirror x if left hand
  const mirrored = scaled.map((pt) => ({
    x: isLeftHand ? -pt.x : pt.x,
    y: pt.y,
    z: pt.z,
  }));

  if (!ignoreTilt) {
    return mirrored;
  }

  // 4. Rotation alignment: align vector (0 -> 9) with vertical up (0, -1)
  const mx = mirrored[9].x;
  const my = mirrored[9].y;
  const currentAngle = Math.atan2(my, mx); // angle in radians
  const targetAngle = -Math.PI / 2; // -90 degrees (pointing up)
  const rotationAngle = targetAngle - currentAngle;

  const cosA = Math.cos(rotationAngle);
  const sinA = Math.sin(rotationAngle);

  return mirrored.map((pt) => ({
    x: pt.x * cosA - pt.y * sinA,
    y: pt.x * sinA + pt.y * cosA,
    z: pt.z,
  }));
}
