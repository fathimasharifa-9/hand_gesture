export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type GestureKind = 'pose' | 'move';
export type PriorityLevel = 'normal' | 'important' | 'urgent';

export interface GestureSample {
  id: string;
  label: string;
  priority: PriorityLevel;
  kind: GestureKind;
  features: number[]; // Extracted feature vector
  createdAt: number;
}

export interface GestureDefinition {
  id: string;
  label: string;
  priority: PriorityLevel;
  kind: GestureKind;
  samples: number[][]; // Array of feature vectors
  createdAt: number;
}

export interface EngineSettings {
  holdMs: number;         // default 1200 ms
  minConfidence: number;  // default 0.75
  minMargin: number;      // default 0.15
  cooldownMs: number;     // default 5000 ms
  ignoreTilt: boolean;    // default true
  twoStepUrgent: boolean; // default true
  speak: boolean;         // default true
  largeText: boolean;     // default false
}

export interface UserProfile {
  id: string;
  name: string;
  bed: string;
  gestures: GestureDefinition[];
  restSamples: number[][]; // Feature vectors for "not a request"
  settings: EngineSettings;
  faceBaseline?: any;
  updatedAt: number;
}

export interface ClassificationResult {
  label: string | null;     // Matched request name or null if rest/none
  gestureId: string | null;
  confidence: number;       // 0 to 1
  margin: number;           // Difference between best and 2nd best
  isRest: boolean;
  isUnsure: boolean;
  nearestDistance: number;
  priority?: PriorityLevel;
}

export type EngineState =
  | 'NO_HAND'
  | 'LOOKING'
  | 'CANDIDATE'
  | 'HOLDING'
  | 'SENT'
  | 'WAITING'
  | 'ACKED'
  | 'COOLDOWN';

export interface GestureCoachWarning {
  gestureA: string;
  gestureB: string;
  similarity: number; // 0 to 1
  message: string;
}

export interface ComfortScore {
  gestureId: string;
  label: string;
  score: 'Easy for you' | 'Might be tiring';
  variance: number;
}

export interface Point2D {
  x: number;
  y: number;
  label: string;
  kind: 'gesture' | 'rest';
}
