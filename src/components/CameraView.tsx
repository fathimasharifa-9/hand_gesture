import React, { useEffect, useRef, useState } from 'react';
import { HandLandmarker, FilesetResolver, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Camera, AlertCircle, RefreshCw, Zap, ShieldCheck } from 'lucide-react';

interface CameraViewProps {
  onLandmarksDetected?: (landmarks: NormalizedLandmark[][] | null) => void;
  onFpsUpdate?: (fps: number) => void;
  holdProgress?: number; // 0 to 1 for hold ring animation
  detectedLabel?: string | null;
  className?: string;
}

export const CameraView: React.FC<CameraViewProps> = ({
  onLandmarksDetected,
  onFpsUpdate,
  holdProgress = 0,
  detectedLabel = null,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [isHandPresent, setIsHandPresent] = useState<boolean>(false);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef<number>(0);

  // Initialize MediaPipe HandLandmarker locally
  useEffect(() => {
    let isMounted = true;

    async function initHandLandmarker() {
      try {
        setIsLoading(true);
        setErrorMsg(null);

        // Load WASM files locally from public/mediapipe/wasm
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

        if (!isMounted) return;

        // Try GPU delegate first, fall back to CPU if needed
        let landmarker: HandLandmarker;
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (gpuError) {
          console.warn('GPU delegate failed, falling back to CPU delegate:', gpuError);
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/mediapipe/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        }

        if (!isMounted) return;
        handLandmarkerRef.current = landmarker;

        // Start video stream
        await startCamera();
        setIsLoading(false);
      } catch (err: any) {
        console.error('Error initializing HandLandmarker:', err);
        if (isMounted) {
          setErrorMsg('Could not load hand tracking model. Please make sure camera permissions are allowed and refresh.');
          setIsLoading(false);
        }
      }
    }

    initHandLandmarker();

    return () => {
      isMounted = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Request camera access
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
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

  // Render loop: detect hand landmarks & draw on canvas
  const renderLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = handLandmarkerRef.current;

    if (!video || !canvas || !landmarker || video.paused || video.ended) {
      animFrameIdRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const now = performance.now();
      const results = landmarker.detectForVideo(video, now);

      // FPS calculation
      frameCountRef.current++;
      if (now - lastTimeRef.current >= 1000) {
        const calculatedFps = Math.round((frameCountRef.current * 1000) / (now - lastTimeRef.current));
        setFps(calculatedFps);
        if (onFpsUpdate) onFpsUpdate(calculatedFps);
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (results.landmarks && results.landmarks.length > 0) {
          setIsHandPresent(true);
          if (onLandmarksDetected) onLandmarksDetected(results.landmarks);

          const landmarks = results.landmarks[0];
          drawHandSkeleton(ctx, landmarks, canvas.width, canvas.height);
        } else {
          setIsHandPresent(false);
          if (onLandmarksDetected) onLandmarksDetected(null);
        }
      }
    }

    animFrameIdRef.current = requestAnimationFrame(renderLoop);
  };

  // Draw glowing teal skeleton line and dots
  const drawHandSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    width: number,
    height: number
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
      [5, 9], [9, 13], [13, 17]
    ];

    // Draw glowing teal bones
    ctx.strokeStyle = '#0E9F9A';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#2DD4BF';
    ctx.shadowBlur = 12;

    HAND_CONNECTIONS.forEach(([i, j]) => {
      const pt1 = landmarks[i];
      const pt2 = landmarks[j];
      ctx.beginPath();
      ctx.moveTo(pt1.x * width, pt1.y * height);
      ctx.lineTo(pt2.x * width, pt2.y * height);
      ctx.stroke();
    });

    // Draw landmark dots
    landmarks.forEach((pt) => {
      ctx.shadowColor = '#2DD4BF';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#2DD4BF';
      ctx.beginPath();
      ctx.arc(pt.x * width, pt.y * height, 6, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(pt.x * width, pt.y * height, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  // Calculate hold ring parameters
  const ringRadius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference - holdProgress * circumference;

  return (
    <div className={`relative w-full rounded-2xl overflow-hidden bg-black shadow-2xl border-4 border-white/20 dark:border-gray-800 ${className}`}>
      
      {/* Video element (Mirrored) */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full h-full object-cover transform -scale-x-100"
      />

      {/* Canvas Overlay for hand skeleton (Mirrored) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none transform -scale-x-100"
      />

      {/* FPS & Status Badges Overlay */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white text-xs font-medium border border-white/10">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>{fps} FPS</span>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border ${
          isHandPresent
            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            : 'bg-black/60 text-gray-300 border-white/10'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isHandPresent ? 'bg-emerald-400 animate-ping' : 'bg-gray-400'}`} />
          <span>{isHandPresent ? 'Hand Detected' : 'Bring hand into camera'}</span>
        </div>
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
          <p className="text-base text-gray-300 max-w-md mb-6 leading-relaxed">
            {errorMsg}
          </p>
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
