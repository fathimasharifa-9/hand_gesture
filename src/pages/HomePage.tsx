import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HandSkeletonHero } from '../components/HandSkeletonHero';
import { Hand, HeartPulse, Sparkles, Shield, WifiOff, ArrowRight } from 'lucide-react';

export const HomePage: React.FC = () => {
  return (
    <div className="min-h-[calc(100vh-5rem)] flex flex-col justify-between max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      
      {/* Hero Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center mb-16">
        
        {/* Left Column: Heading & Copy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="lg:col-span-7 flex flex-col items-start space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-teal-soft dark:bg-brand-teal/20 text-brand-teal text-sm font-semibold">
            <Sparkles className="w-4 h-4" />
            <span>AI Movement Communication Tool</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-brand-ink dark:text-white leading-[1.15]">
            REACH learns the movement <span className="text-brand-teal">you can make.</span>
          </h1>

          <p className="text-lg sm:text-xl text-brand-muted dark:text-dark-muted font-normal leading-relaxed max-w-2xl">
            Instead of asking you to learn difficult hand signs, REACH learns whatever small hand shape or wrist movement is easy for you, and turns it into a request for help.
          </p>

          <div className="flex flex-wrap gap-4 pt-2">
            <Link
              to="/teach"
              className="h-16 px-8 bg-brand-teal hover:bg-brand-teal-hover text-white text-lg font-bold rounded-xl shadow-lg shadow-brand-teal/25 flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Hand className="w-6 h-6" />
              <span>Teach My Movements</span>
              <ArrowRight className="w-5 h-5" />
            </Link>

            <Link
              to="/live"
              className="h-16 px-8 bg-white dark:bg-dark-card border-2 border-brand-teal/30 hover:border-brand-teal text-brand-ink dark:text-white text-lg font-bold rounded-xl flex items-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Use Live Camera</span>
            </Link>
          </div>
        </motion.div>

        {/* Right Column: Hand Skeleton Hero Graphic */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="lg:col-span-5 flex justify-center items-center"
        >
          <HandSkeletonHero />
        </motion.div>

      </div>

      {/* Three Main Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
        
        {/* Card 1: Patient */}
        <motion.div
          whileHover={{ y: -6 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="bg-white dark:bg-dark-card p-8 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-teal-500/10 text-brand-teal flex items-center justify-center mb-6">
              <Hand className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold font-heading mb-3 text-brand-ink dark:text-white">
              I Need Help
            </h2>
            <p className="text-brand-muted dark:text-dark-muted text-base leading-relaxed mb-6">
              Open the live camera screen. Hold your movement to ask for Water, Pain relief, Bathroom, or Emergency care.
            </p>
          </div>
          <Link
            to="/live"
            className="w-full h-14 bg-brand-teal hover:bg-brand-teal-hover text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <span>Open Live Screen</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>

        {/* Card 2: Caregiver */}
        <motion.div
          whileHover={{ y: -6 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="bg-white dark:bg-dark-card p-8 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mb-6">
              <HeartPulse className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold font-heading mb-3 text-brand-ink dark:text-white">
              I am a Caregiver
            </h2>
            <p className="text-brand-muted dark:text-dark-muted text-base leading-relaxed mb-6">
              See live help calls on your laptop or phone. Tap Acknowledge to send "Help is coming" to the patient screen.
            </p>
          </div>
          <Link
            to="/caregiver"
            className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <span>Caregiver Screen</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>

        {/* Card 3: Judge / Demo */}
        <motion.div
          whileHover={{ y: -6 }}
          transition={{ type: "spring", stiffness: 300 }}
          className="bg-white dark:bg-dark-card p-8 rounded-2xl border border-gray-200/80 dark:border-gray-800 shadow-soft flex flex-col justify-between"
        >
          <div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mb-6">
              <Sparkles className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold font-heading mb-3 text-brand-ink dark:text-white">
              Judge Demo
            </h2>
            <p className="text-brand-muted dark:text-dark-muted text-base leading-relaxed mb-6">
              Teach custom movements in under 20 seconds, test false alarm rejection, and inspect accuracy statistics.
            </p>
          </div>
          <Link
            to="/teach"
            className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <span>Start Teach Demo</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        </motion.div>

      </div>

      {/* Feature Badges Footer */}
      <div className="border-t border-gray-200/60 dark:border-gray-800 pt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <WifiOff className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base font-heading">100% Offline Wi-Fi</h3>
            <p className="text-xs text-brand-muted dark:text-dark-muted">Works with no internet connection on your local network.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-brand-teal flex items-center justify-center shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base font-heading">Complete Privacy</h3>
            <p className="text-xs text-brand-muted dark:text-dark-muted">No video is saved or sent. Hand points processed in browser.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            <Hand className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base font-heading">Zero False Alarms</h3>
            <p className="text-xs text-brand-muted dark:text-dark-muted">Rest hand filtering & hold ring ensure confident requests.</p>
          </div>
        </div>
      </div>

    </div>
  );
};
