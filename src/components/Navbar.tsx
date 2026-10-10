import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock, Sun, Moon, Hand, Video, ShieldCheck, HeartPulse, BarChart3, Settings } from 'lucide-react';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ darkMode, setDarkMode }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Home', icon: Hand },
    { path: '/teach', label: 'Teach', icon: Hand },
    { path: '/live', label: 'Live Camera', icon: Video },
    { path: '/caregiver', label: 'Caregiver', icon: HeartPulse },
    { path: '/results', label: 'Results', icon: BarChart3 },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-dark-card/80 backdrop-blur-md border-b border-gray-200/60 dark:border-gray-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-brand-teal/10 dark:bg-brand-teal/20 flex items-center justify-center text-brand-teal group-hover:scale-105 transition-transform">
              <Hand className="w-7 h-7" />
            </div>
            <div>
              <span className="font-heading text-2xl font-bold tracking-tight text-brand-ink dark:text-white flex items-center gap-2">
                REACH
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-teal/15 text-brand-teal uppercase tracking-wider">
                  v1.0
                </span>
              </span>
              <p className="text-xs text-brand-muted dark:text-dark-muted hidden sm:block">
                Movement-based communication
              </p>
            </div>
          </Link>

          {/* Privacy Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 text-xs font-medium">
            <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Private: video never leaves this device</span>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${
                    isActive
                      ? 'bg-brand-teal text-white shadow-md shadow-brand-teal/20'
                      : 'text-brand-ink/70 dark:text-dark-ink/70 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-brand-ink dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label="Toggle Theme"
              className="p-2.5 rounded-xl text-brand-ink/70 dark:text-dark-ink/70 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ml-1"
            >
              {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5" />}
            </button>
          </nav>

        </div>
      </div>
    </header>
  );
};
