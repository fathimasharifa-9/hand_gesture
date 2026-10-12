import { Landmark } from './types';

/**
 * Normalizes 21 3D hand landmarks:
 * 1. Subtracts wrist position (landmark 0)
 * 2. Scales coordinates with palm-geometry validation (resilient to occlusion/pitch)
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

  // 1. Subtract wrist
  const centered = rawLandmarks.map((pt) => ({
    x: pt.x - wrist.x,
    y: pt.y - wrist.y,
    z: pt.z - wrist.z,
  }));

  // 2. Scale factor: robust palm span measurement
  // Primary: wrist (0) to middle knuckle (9)
  const d9 = Math.hypot(centered[9].x, centered[9].y, centered[9].z);
  // Supporting palm anchors: index knuckle (5) and pinky knuckle (17)
  const d5 = Math.hypot(centered[5].x, centered[5].y, centered[5].z);
  const d17 = Math.hypot(centered[17].x, centered[17].y, centered[17].z);
  const dPalmWidth = Math.hypot(
    centered[5].x - centered[17].x,
    centered[5].y - centered[17].y,
    centered[5].z - centered[17].z
  );

  // If d9 is valid and matches palm proportions, use it (matches trained profiles);
  // otherwise fallback to palm geometry average to prevent foreshortening blowup
  let scale = d9;
  if (!scale || scale < 0.001 || (d5 > 0 && scale < d5 * 0.45)) {
    const palmAvg = (d5 + d17 + dPalmWidth) / 2.4;
    scale = palmAvg > 0.001 ? palmAvg : 1.0;
  }

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

/**
 * Exponential Moving Average (EMA) smoother for 21 3D hand landmarks
 * Eliminates single-frame tracking flicker and jitter
 */
export class LandmarkSmoother {
  private prevLandmarks: Landmark[] | null = null;
  private alpha: number;

  constructor(alpha: number = 0.65) {
    this.alpha = alpha;
  }

  public smooth(raw: Landmark[]): Landmark[] {
    if (!raw || raw.length < 21) {
      this.prevLandmarks = null;
      return raw;
    }
    if (!this.prevLandmarks || this.prevLandmarks.length !== raw.length) {
      this.prevLandmarks = raw.map((p) => ({ ...p }));
      return raw;
    }

    const smoothed: Landmark[] = raw.map((pt, idx) => {
      const prev = this.prevLandmarks![idx];
      return {
        x: this.alpha * pt.x + (1 - this.alpha) * prev.x,
        y: this.alpha * pt.y + (1 - this.alpha) * prev.y,
        z: this.alpha * pt.z + (1 - this.alpha) * prev.z,
      };
    });

    this.prevLandmarks = smoothed;
    return smoothed;
  }

  public reset() {
    this.prevLandmarks = null;
  }
}
