import React, { useState, useEffect } from 'react';
import { Settings, Moon, Sun, Volume2, ShieldCheck, Clock, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { EngineSettings, UserProfile } from '../engine/types';
import { getStoredProfile, saveProfile } from '../utils/profileStorage';

interface SettingsPageProps {
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ darkMode, setDarkMode }) => {
  const [profile, setProfile] = useState<UserProfile>(getStoredProfile());
  const [settings, setSettings] = useState<EngineSettings>(profile.settings);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    const prof = getStoredProfile();
    setProfile(prof);
    setSettings(prof.settings);
  }, []);

  const handleSettingChange = (key: keyof EngineSettings, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    const updatedProfile = { ...profile, settings: updated };
    setProfile(updatedProfile);
    saveProfile(updatedProfile);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleResetDemo = async () => {
    if (confirm('Reset all requests log? (Your taught profile movements will be kept).')) {
      await fetch('/api/reset-demo', { method: 'POST' });
      alert('Demo requests cleared cleanly!');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-teal/10 text-brand-teal flex items-center justify-center">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold font-heading text-brand-ink dark:text-white">
              App Settings
            </h1>
            <p className="text-xs text-brand-muted dark:text-dark-muted">
              Customize timing, strictness, speech, and theme preferences.
            </p>
          </div>
        </div>

        {savedSuccess && (
          <span className="text-xs font-bold px-3 py-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Saved
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-dark-card rounded-2xl p-6 border border-gray-200/80 dark:border-gray-800 shadow-soft space-y-6">
        
        {/* Dark Theme Toggle */}
        <div className="flex items-center justify-between py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="font-heading font-bold text-base text-brand-ink dark:text-white">
              Dark Mode (Night Shift)
            </h3>
            <p className="text-xs text-brand-muted dark:text-dark-muted">
              Easier on the eyes in low light hospital environments.
            </p>
          </div>
          <button
            onClick={() => setDarkMode((prev) => !prev)}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors ${
              darkMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-slate-100 text-slate-800 border border-slate-200'
            }`}
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            <span>{darkMode ? 'Dark Theme ON' : 'Light Theme ON'}</span>
          </button>
        </div>

        {/* Hold Time Slider */}
        <div className="py-4 border-b border-gray-100 dark:border-gray-800 space-y-2">
          <div className="flex justify-between">
            <h3 className="font-heading font-bold text-base text-brand-ink dark:text-white">
              Hold Ring Duration (Ms)
            </h3>
            <span className="text-sm font-bold text-brand-teal">{(settings.holdMs / 1000).toFixed(1)} seconds</span>
          </div>
          <input
            type="range"
            min="500"
            max="3000"
            step="100"
            value={settings.holdMs}
            onChange={(e) => handleSettingChange('holdMs', Number(e.target.value))}
            className="w-full accent-brand-teal cursor-pointer"
          />
          <p className="text-xs text-brand-muted">
            How long a gesture must be held before dispatching a request.
          </p>
        </div>

        {/* Strictness Confidence Threshold Slider */}
        <div className="py-4 border-b border-gray-100 dark:border-gray-800 space-y-2">
          <div className="flex justify-between">
            <h3 className="font-heading font-bold text-base text-brand-ink dark:text-white">
              Gesture Recognition Strictness
            </h3>
            <span className="text-sm font-bold text-brand-teal">{Math.round(settings.minConfidence * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="0.95"
            step="0.05"
            value={settings.minConfidence}
            onChange={(e) => handleSettingChange('minConfidence', Number(e.target.value))}
            className="w-full accent-brand-teal cursor-pointer"
          />
          <p className="text-xs text-brand-muted">
            Higher values prevent false triggers; lower values make detection easier.
          </p>
        </div>

        {/* Cooldown Slider */}
        <div className="py-4 border-b border-gray-100 dark:border-gray-800 space-y-2">
          <div className="flex justify-between">
            <h3 className="font-heading font-bold text-base text-brand-ink dark:text-white">
              Request Cooldown Timer
            </h3>
            <span className="text-sm font-bold text-brand-teal">{(settings.cooldownMs / 1000).toFixed(1)} seconds</span>
          </div>
          <input
            type="range"
            min="2000"
            max="10000"
            step="1000"
            value={settings.cooldownMs}
            onChange={(e) => handleSettingChange('cooldownMs', Number(e.target.value))}
            className="w-full accent-brand-teal cursor-pointer"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-sm text-brand-ink dark:text-white">Two-Stage Confirm for Emergency</h4>
              <p className="text-xs text-brand-muted">Requires holding Emergency gesture twice before sending.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.twoStepUrgent}
              onChange={(e) => handleSettingChange('twoStepUrgent', e.target.checked)}
              className="w-5 h-5 accent-brand-teal cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-sm text-brand-ink dark:text-white">Text-to-Speech Audio</h4>
              <p className="text-xs text-brand-muted font-medium">Reads out acknowledgments aloud.</p>
            </div>
            <input
              type="checkbox"
              checked={settings.speak}
              onChange={(e) => handleSettingChange('speak', e.target.checked)}
              className="w-5 h-5 accent-brand-teal cursor-pointer"
            />
          </div>
        </div>

        {/* Demo Helper Actions */}
        <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <div>
            <h4 className="font-heading font-bold text-base text-brand-ink dark:text-white">Reset Demo Log</h4>
            <p className="text-xs text-brand-muted">Clears request history for clean judge demos.</p>
          </div>
          <button
            onClick={handleResetDemo}
            className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors border border-red-500/30"
          >
            <Trash2 className="w-4 h-4" />
            <span>Reset Demo Requests</span>
          </button>
        </div>

      </div>

      {/* About & Privacy Card */}
      <div className="bg-teal-50 dark:bg-teal-950/30 p-6 rounded-2xl border border-teal-200 dark:border-teal-800 text-teal-950 dark:text-teal-200 space-y-2">
        <h4 className="font-heading font-bold text-base flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand-teal" />
          <span>About REACH & Privacy</span>
        </h4>
        <p className="text-xs leading-relaxed opacity-90">
          Your video stays on this device. Only hand landmark coordinate numbers are processed locally. Not a medical device. A caregiver always decides.
        </p>
      </div>
    </div>
  );
};
