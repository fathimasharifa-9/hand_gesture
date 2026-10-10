import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { TeachPage } from './pages/TeachPage';
import { LivePage } from './pages/LivePage';
import { CaregiverPage } from './pages/CaregiverPage';
import { ResultsPage } from './pages/ResultsPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('reach_theme') === 'dark';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('reach_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('reach_theme', 'light');
    }
  }, [darkMode]);

  return (
    <Router>
      <div className="min-h-screen bg-brand-bg dark:bg-dark-bg text-brand-ink dark:text-dark-ink transition-colors duration-300">
        <Navbar darkMode={darkMode} setDarkMode={setDarkMode} />
        <main>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/teach" element={<TeachPage />} />
            <Route path="/live" element={<LivePage />} />
            <Route path="/caregiver" element={<CaregiverPage />} />
            <Route path="/results" element={<ResultsPage />} />
            <Route path="/settings" element={<SettingsPage darkMode={darkMode} setDarkMode={setDarkMode} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
