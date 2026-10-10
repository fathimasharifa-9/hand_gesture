import React from 'react';
import { motion } from 'framer-motion';

export const HandSkeletonHero: React.FC = () => {
  // Hand joint points representing hand skeleton
  const joints = [
    { id: 'wrist', x: 200, y: 340 },
    // Thumb
    { id: 't1', x: 160, y: 300 },
    { id: 't2', x: 130, y: 260 },
    { id: 't3', x: 110, y: 220 },
    // Index
    { id: 'i1', x: 170, y: 220 },
    { id: 'i2', x: 165, y: 160 },
    { id: 'i3', x: 160, y: 100 },
    // Middle
    { id: 'm1', x: 200, y: 210 },
    { id: 'm2', x: 200, y: 140 },
    { id: 'm3', x: 200, y: 70 },
    // Ring
    { id: 'r1', x: 230, y: 220 },
    { id: 'r2', x: 235, y: 160 },
    { id: 'r3', x: 240, y: 110 },
    // Pinky
    { id: 'p1', x: 255, y: 240 },
    { id: 'p2', x: 265, y: 190 },
    { id: 'p3', x: 275, y: 150 },
  ];

  const connections = [
    // Thumb
    ['wrist', 't1'], ['t1', 't2'], ['t2', 't3'],
    // Index
    ['wrist', 'i1'], ['i1', 'i2'], ['i2', 'i3'],
    // Middle
    ['wrist', 'm1'], ['m1', 'm2'], ['m2', 'm3'],
    // Ring
    ['wrist', 'r1'], ['r1', 'r2'], ['r2', 'r3'],
    // Pinky
    ['wrist', 'p1'], ['p1', 'p2'], ['p2', 'p3'],
    // Palm connections
    ['t1', 'i1'], ['i1', 'm1'], ['m1', 'r1'], ['r1', 'p1']
  ];

  const findJoint = (id: string) => joints.find(j => j.id === id)!;

  return (
    <div className="relative w-72 h-72 sm:w-96 sm:h-96 flex items-center justify-center">
      {/* Background Animated Gradient Blob */}
      <motion.div
        animate={{
          scale: [1, 1.08, 1],
          rotate: [0, 90, 180, 270, 360],
          borderRadius: ["40% 60% 70% 30% / 40% 50% 60% 50%", "60% 40% 30% 70% / 50% 30% 70% 40%", "40% 60% 70% 30% / 40% 50% 60% 50%"]
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute inset-0 bg-gradient-to-tr from-brand-teal/20 via-teal-300/20 to-emerald-400/20 dark:from-brand-teal/30 dark:to-cyan-500/20 blur-2xl pointer-events-none"
      />

      {/* Hand Skeleton SVG */}
      <svg viewBox="0 0 400 400" className="w-full h-full relative z-10 drop-shadow-xl">
        <defs>
          <linearGradient id="glowLine" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#0E9F9A" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#2DD4BF" stopOpacity="1" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Bone Lines */}
        {connections.map(([fromId, toId], idx) => {
          const from = findJoint(fromId);
          const to = findJoint(toId);
          return (
            <motion.line
              key={idx}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="url(#glowLine)"
              strokeWidth="4"
              strokeLinecap="round"
              filter="url(#glow)"
              animate={{
                strokeWidth: [4, 5, 4],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: idx * 0.1,
              }}
            />
          );
        })}

        {/* Joint Dots */}
        {joints.map((joint) => (
          <motion.circle
            key={joint.id}
            cx={joint.x}
            cy={joint.y}
            r="6"
            fill="#2DD4BF"
            stroke="#FFFFFF"
            strokeWidth="2"
            filter="url(#glow)"
            animate={{
              r: [6, 8, 6],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: joint.x * 0.005,
            }}
          />
        ))}
      </svg>
    </div>
  );
};
