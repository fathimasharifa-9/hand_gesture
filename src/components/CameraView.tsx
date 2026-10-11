import React, { useEffect, useRef, useState } from 'react';
import {
  HandLandmarker,
  FaceLandmarker,
  FilesetResolver,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { Camera, AlertCircle, RefreshCw, Zap, ShieldCheck, Moon, Sun } from 'lucide-react';

interface CameraViewProps {
  onLandmarksDetected?: (landmarks: NormalizedLandmark[][] | null) => void;
  onFpsUpdate?: (fps: number) => void;
  holdProgress?: number; // 0 to 1 for hold ring animation
  detectedLabel?: string | null;
  className?: string;
  enableFaceTracking?: boolean;
  showFaceSkeleton?: boolean;
  onFaceBlendshapesDetected?: (blendshapes: Record<string, number> | null) => void;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onLandmarksDetected,
  onFpsUpdate,
  holdProgress = 0,
  detectedLabel = null,
  className = '',
  enableFaceTracking = false,
  showFaceSkeleton = false,
  onFaceBlendshapesDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [isHandPresent, setIsHandPresent] = useState<boolean>(false);
  const [nightMode, setNightMode] = useState<boolean>(() => {
    return localStorage.getItem('reach_night_mode') === 'true';
  });

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);
  const faceFrameSkipCounter = useRef<number>(0);

  const toggleNightMode = () => {
    const next = !nightMode;
    setNightMode(next);
    localStorage.setItem('reach_night_mode', String(next));
  };

  // Initialize MediaPipe HandLandmarker and FaceLandmarker locally
  useEffect(() => {
    let isMounted = true;

    async function initModels() {
      try {
        setIsLoading(true);
        setErrorMsg(null);

        // Load WASM files locally from public/mediapipe/wasm
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

        if (!isMounted) return;

        // 1. Hand Landmarker
        let handLandmarker: HandLandmarker;
        try {
          handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.38,
            minHandPresenceConfidence: 0.38,
            minTrackingConfidence: 0.38,
          });
        } catch (gpuError) {
          console.warn('Hand GPU delegate failed, falling back to CPU delegate:', gpuError);
          handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.38,
            minHandPresenceConfidence: 0.38,
            minTrackingConfidence: 0.38,
          });
        }

        if (!isMounted) return;
        handLandmarkerRef.current = handLandmarker;

        // 2. Face Landmarker (for Distress Watch)
        try {
          const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/face_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            outputFaceBlendshapes: true,
            numFaces: 1,
            minFaceDetectionConfidence: 0.4,
            minFacePresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          });
          if (isMounted) faceLandmarkerRef.current = faceLandmarker;
        } catch (faceGpuErr) {
          try {
            const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: '/mediapipe/face_landmarker.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              outputFaceBlendshapes: true,
              numFaces: 1,
              minFaceDetectionConfidence: 0.4,
              minFacePresenceConfidence: 0.4,
              minTrackingConfidence: 0.4,
            });
            if (isMounted) faceLandmarkerRef.current = faceLandmarker;
          } catch (faceErr) {
            console.warn('FaceLandmarker load failed:', faceErr);
          }
        }

        // Start video stream
        await startCamera();
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error initializing models:', err);
        if (isMounted) {
          setErrorMsg('Could not load camera models. Please check permissions and reload.');
          setIsLoading(false);
        }
      }
    }

    initModels();

    return () => {
      isMounted = false;
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
      if (faceLandmarkerRef.current) faceLandmarkerRef.current.close();
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Request camera access with 640x480 resolution for high-FPS low-latency tracking
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        requestAnimationFrame(renderLoop);
      }
    } catch (err: any) {
      console.error('Webcam access error:', err);
      setErrorMsg('I can\'t see your camera. Please allow camera access in your browser or plug in a camera.');
      setIsLoading(false);
    }
  };

  // Render loop: detect hand landmarks and optional face blendshapes
  const renderLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const handLandmarker = handLandmarkerRef.current;

    if (!video || !canvas || !handLandmarker || video.paused || video.ended) {
      animFrameIdRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const now = performance.now();
      const results = handLandmarker.detectForVideo(video, now);

      // FPS calculation
      frameCountRef.current++;
      if (now - lastTimeRef.current >= 1000) {
        const calculatedFps = Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current));
        setFps(calculatedFps);
        if (onFpsUpdate) onFpsUpdate(calculatedFps);
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      // Hand skeleton drawing
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks && results.landmarks.length > 0) {
          setIsHandPresent(true);
          if (onLandmarksDetected) onLandmarksDetected(results.landmarks);

          // Draw skeleton for all detected hands (1 or 2 hands)
          results.landmarks.forEach((handLandmarks, idx) => {
            drawHandSkeleton(ctx, handLandmarks, canvas.width, canvas.height, nightMode, idx);
          });
        } else {
          setIsHandPresent(false);
          if (onLandmarksDetected) onLandmarksDetected(null);
        }
      }

      // Run FaceLandmarker when Distress Watch is enabled
      // If FPS drops below 15, run face model every 2nd frame per spec 3.1
      if (enableFaceTracking && faceLandmarkerRef.current && onFaceBlendshapesDetected) {
        faceFrameSkipCounter.current++;
        const shouldRunFace = fps >= 15 || faceFrameSkipCounter.current % 2 === 0;

        if (shouldRunFace) {
          try {
            const faceResults = faceLandmarkerRef.current.detectForVideo(video, now);
            if (faceResults.faceBlendshapes && faceResults.faceBlendshapes.length > 0) {
              const categories = faceResults.faceBlendshapes[0].categories;
              const map: Record<string, number> = {};
              categories.forEach((c) => {
                map[c.categoryName] = c.score;
              });
              onFaceBlendshapesDetected(map);

              // Draw face skeleton if requested (per Feature B)
              if (showFaceSkeleton && faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0 && ctx) {
                drawFaceSkeleton(ctx, faceResults.faceLandmarks[0], canvas.width, canvas.height, nightMode);
              }
            } else {
              onFaceBlendshapesDetected(null);
            }
          } catch (e) {}
        }
      }
    }

    animFrameIdRef.current = requestAnimationFrame(renderLoop);
  };

  // Draw glowing skeleton line and dots (with ultra-high-contrast neon mode for night)
  const drawHandSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    width: number,
    height: number,
    isNight: boolean,
    handIndex: number = 0
  ) => {
    const HAND_CONNECTIONS = [
      // Thumb
      [0, 1], [1, 2], [2, 3], [3, 4],
      // Index
      [0, 5], [5, 6], [6, 7], [7, 8],
      // Middle
      [0, 9], [9, 10], [10, 11], [11, 12],
      // Ring
      [0, 13], [13, 14], [14, 15], [15, 16],
      // Pinky
      [0, 17], [17, 18], [18, 19], [19, 20],
      // Palm connections
      [5, 9], [9, 13], [13, 17],
    ];

    // Give hand 1 and hand 2 distinct harmonious colors
    const strokeColor = handIndex === 0
      ? (isNight ? '#00F2FE' : '#0E9F9A')
      : (isNight ? '#F43F5E' : '#6366F1');
    const glowColor = handIndex === 0
      ? (isNight ? '#38BDF8' : '#2DD4BF')
      : (isNight ? '#FB7185' : '#818CF8');

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isNight ? 6 : 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isNight ? 18 : 12;

    HAND_CONNECTIONS.forEach(([i, j]) => {
      const pt1 = landmarks[i];
      const pt2 = landmarks[j];
      ctx.beginPath();
      ctx.moveTo(pt1.x * width, pt1.y * height);
      ctx.lineTo(pt2.x * width, pt2.y * height);
      ctx.stroke();
    });

    landmarks.forEach((pt) => {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = isNight ? 14 : 10;
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(pt.x * width, pt.y * height, isNight ? 7 : 6, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(pt.x * width, pt.y * height, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  // Draw facial landmark contour skeleton (Feature B)
  const drawFaceSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    width: number,
    height: number,
    isNight: boolean
  ) => {
    // Key face landmark indices (silhouette, lips, eyebrows, eyes)
    const KEY_FACE_POINTS = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
      377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
      // Eyebrows
      70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
      // Eyes
      33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380,
      // Lips
      61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291
    ];

    ctx.fillStyle = isNight ? '#F43F5E' : '#8B5CF6';
    ctx.shadowColor = isNight ? '#FB7185' : '#A78BFA';
    ctx.shadowBlur = 10;

    KEY_FACE_POINTS.forEach((idx) => {
      const pt = landmarks[idx];
      if (!pt) return;
      ctx.beginPath();
      ctx.arc(pt.x * width, pt.y * height, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  const ringRadius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference - holdProgress * circumference;

  return (
    <div
      className={`relative w-full rounded-2xl overflow-hidden bg-black shadow-2xl transition-all duration-300 ${
        nightMode
          ? 'border-8 border-amber-100/90 shadow-[0_0_90px_rgba(254,243,199,0.7)]'
          : 'border-4 border-white/20 dark:border-gray-800'
      } ${className}`}
    >
      {/* Night Light Screen Glow (illuminates hands in dark rooms) */}
      {nightMode && (
        <div className="absolute inset-0 pointer-events-none z-10 border-[16px] border-amber-50/80 shadow-[inset_0_0_80px_rgba(255,251,235,0.9)] animate-pulse" />
      )}

      {/* Video element (Mirrored, with brightness/contrast boost in Night Mode) */}
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          filter: nightMode ? 'brightness(1.4) contrast(1.3) saturate(1.15)' : 'none',
        }}
        className="w-full h-full object-cover transform -scale-x-100 transition-all duration-300"
      />

      {/* Canvas Overlay for hand skeleton (Mirrored) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none transform -scale-x-100 z-10"
      />

      {/* Top Left: FPS & Status Badges */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white text-xs font-medium border border-white/10">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>{fps} FPS</span>
        </div>

        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border ${
            isHandPresent
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : 'bg-black/60 text-gray-300 border-white/10'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isHandPresent ? 'bg-emerald-400 animate-ping' : 'bg-gray-400'}`} />
          <span>{isHandPresent ? 'Hand Detected' : 'Bring hand into camera'}</span>
        </div>
      </div>

      {/* Top Right: Night Light (Low Light Assist) Toggle */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          onClick={toggleNightMode}
          className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border shadow transition-all ${
            nightMode
              ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-400/50'
              : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
          }`}
          title="Turn on soft screen light to illuminate your hand in dim or dark rooms"
        >
          {nightMode ? <Sun className="w-3.5 h-3.5 text-amber-600" /> : <Moon className="w-3.5 h-3.5 text-amber-300" />}
          <span>{nightMode ? 'Night Light: ON 💡' : 'Night Light'}</span>
        </button>
      </div>

      {/* Privacy Badge on video bottom-left */}
      <div className="absolute bottom-4 left-4 z-20 hidden sm:flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full text-white/80 text-xs border border-white/10">
        <ShieldCheck className="w-3.5 h-3.5 text-brand-teal" />
        <span>100% On-Device • No Video Saved</span>
      </div>

      {/* Hold Ring Overlay & Detected Label */}
      {holdProgress > 0 && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none bg-black/20 backdrop-blur-[2px]">
          <div className="relative flex items-center justify-center">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r={ringRadius}
                className="text-white/20"
                strokeWidth={strokeWidth}
                stroke="currentColor"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r={ringRadius}
                className="text-brand-teal transition-all duration-75"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>
            <span className="absolute text-white font-bold text-lg font-heading">
              {Math.round(holdProgress * 100)}%
            </span>
          </div>
          {detectedLabel && (
            <div className="mt-3 px-6 py-2.5 bg-brand-teal text-white font-heading text-xl font-bold rounded-2xl shadow-glow">
              {detectedLabel}
            </div>
          )}
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-40 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-white text-center">
          <RefreshCw className="w-10 h-10 text-brand-teal animate-spin mb-4" />
          <h3 className="text-xl font-heading font-bold mb-2">Starting Camera & Model...</h3>
          <p className="text-sm text-gray-300 max-w-sm">
            Loading MediaPipe Hand tracking engine from local files. Please make sure your camera is connected.
          </p>
        </div>
      )}

      {/* Error Overlay */}
      {errorMsg && (
        <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-lg flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
            <AlertCircle className="w-9 h-9" />
          </div>
          <h3 className="text-2xl font-heading font-bold mb-2">Camera Problem</h3>
          <p className="text-base text-gray-300 max-w-md mb-6 leading-relaxed">{errorMsg}</p>
          <button
            onClick={() => {
              setErrorMsg(null);
              setIsLoading(true);
              startCamera();
            }}
            className="px-6 py-3.5 bg-brand-teal hover:bg-brand-teal-hover text-white font-medium rounded-xl flex items-center gap-2 transition-colors shadow-lg"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try Again</span>
          </button>
        </div>
      )}
    </div>
  );
};
