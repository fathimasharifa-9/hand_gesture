import { ClassificationResult, EngineState, EngineSettings } from './types';

export interface StateMachineUpdate {
  state: EngineState;
  holdProgress: number; // 0 to 1
  matchedGestureId: string | null;
  matchedLabel: string | null;
  shouldSendRequest: boolean;
  needsUrgentConfirm: boolean;
  statusMessage: string;
}

export class DecisionStateMachine {
  private currentState: EngineState = 'NO_HAND';
  private candidateLabel: string | null = null;
  private candidateGestureId: string | null = null;
  private candidateFramesCount: number = 0;
  private holdStartTime: number = 0;
  private lastSentTime: number = 0;
  private lastHoldSeenTime: number = 0;
  private urgentConfirmActive: boolean = false;
  private urgentConfirmTimer: number = 0;

  private settings: EngineSettings;

  constructor(settings?: Partial<EngineSettings>) {
    this.settings = {
      holdMs: 1000,
      minConfidence: 0.60,
      minMargin: 0.08,
      cooldownMs: 4000,
      ignoreTilt: true,
      twoStepUrgent: true,
      speak: true,
      largeText: false,
      ...settings,
    };
  }

  public updateSettings(newSettings: Partial<EngineSettings>) {
    this.settings = { ...this.settings, ...newSettings };
  }

  public processFrame(result: ClassificationResult | null, now: number = performance.now()): StateMachineUpdate {
    // 1. Hand not visible or rest
    if (!result || result.isRest || !result.label || result.confidence < this.settings.minConfidence) {
      if (this.currentState === 'HOLDING') {
        // Allow a 250ms grace window for camera jitter / single dropped frame
        if (now - this.lastHoldSeenTime < 250) {
          const elapsed = now - this.holdStartTime;
          const progress = Math.min(1.0, elapsed / this.settings.holdMs);
          return this.buildResult(progress, `Holding ${this.candidateLabel}...`);
        }
      }

      if (this.currentState === 'COOLDOWN') {
        if (now - this.lastSentTime >= this.settings.cooldownMs) {
          this.currentState = 'NO_HAND';
        } else {
          return this.buildResult(0, 'Gesture cooldown active...');
        }
      } else if (this.currentState === 'WAITING' || this.currentState === 'ACKED') {
        // Keep waiting / acked state until reset
      } else {
        this.currentState = 'NO_HAND';
        this.candidateLabel = null;
        this.candidateGestureId = null;
        this.candidateFramesCount = 0;
      }
      return this.buildResult(0, 'Bring hand into camera frame');
    }

    // Check margin
    if (result.margin < this.settings.minMargin) {
      if (this.currentState === 'HOLDING' && now - this.lastHoldSeenTime < 250) {
        // brief margin dip grace
      } else {
        return this.buildResult(0, 'Not sure. Try holding steady.');
      }
    }

    const { label, gestureId, confidence, priority } = result;

    // State machine logic
    switch (this.currentState) {
      case 'NO_HAND':
      case 'LOOKING':
        this.currentState = 'CANDIDATE';
        this.candidateLabel = label;
        this.candidateGestureId = gestureId;
        this.candidateFramesCount = 1;
        return this.buildResult(0, `Recognizing ${label}...`);

      case 'CANDIDATE':
        if (label === this.candidateLabel) {
          this.candidateFramesCount++;
          if (this.candidateFramesCount >= 5) {
            this.currentState = 'HOLDING';
            this.holdStartTime = now;
            this.lastHoldSeenTime = now;
          }
          return this.buildResult(0, `Hold gesture for ${label}...`);
        } else {
          // Label changed, restart candidate count
          this.candidateLabel = label;
          this.candidateGestureId = gestureId;
          this.candidateFramesCount = 1;
          return this.buildResult(0, `Switched to ${label}...`);
        }

      case 'HOLDING':
        if (label === this.candidateLabel) {
          this.lastHoldSeenTime = now;
          const elapsed = now - this.holdStartTime;
          const progress = Math.min(1.0, elapsed / this.settings.holdMs);

          if (progress >= 1.0) {
            // Check for two-step urgent confirmation if enabled
            if (priority === 'urgent' && this.settings.twoStepUrgent && !this.urgentConfirmActive) {
              this.urgentConfirmActive = true;
              this.urgentConfirmTimer = now;
              this.currentState = 'LOOKING';
              this.candidateFramesCount = 0;
              return this.buildResult(0, 'Hold Emergency again to confirm!', false, true);
            }

            this.currentState = 'SENT';
            this.lastSentTime = now;
            this.urgentConfirmActive = false;
            return this.buildResult(1.0, `Request sent: ${label}`, true);
          }

          return this.buildResult(progress, `Holding ${label}...`);
        } else {
          // Dropped hold, restart candidate
          this.currentState = 'CANDIDATE';
          this.candidateLabel = label;
          this.candidateGestureId = gestureId;
          this.candidateFramesCount = 1;
          return this.buildResult(0, `Switched to ${label}...`);
        }

      case 'SENT':
        this.currentState = 'COOLDOWN';
        return this.buildResult(1.0, `Sent ${this.candidateLabel}!`, false);

      case 'COOLDOWN':
        if (now - this.lastSentTime >= this.settings.cooldownMs) {
          this.currentState = 'NO_HAND';
          this.candidateLabel = null;
          this.candidateGestureId = null;
          this.candidateFramesCount = 0;
          return this.buildResult(0, 'Ready for next movement');
        }
        return this.buildResult(0, 'Cooldown active...');

      default:
        return this.buildResult(0, 'Ready');
    }
  }

  public reset() {
    this.currentState = 'NO_HAND';
    this.candidateLabel = null;
    this.candidateGestureId = null;
    this.candidateFramesCount = 0;
    this.holdStartTime = 0;
    this.urgentConfirmActive = false;
  }

  private buildResult(
    holdProgress: number,
    statusMessage: string,
    shouldSendRequest: boolean = false,
    needsUrgentConfirm: boolean = false
  ): StateMachineUpdate {
    return {
      state: this.currentState,
      holdProgress,
      matchedGestureId: this.candidateGestureId,
      matchedLabel: this.candidateLabel,
      shouldSendRequest,
      needsUrgentConfirm,
      statusMessage,
    };
  }
}
