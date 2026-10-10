/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: '#F8F7F4',
          card: '#FFFFFF',
          ink: '#0F172A',
          muted: '#64748B',
          teal: '#0E9F9A',
          'teal-hover': '#0B7A75',
          'teal-soft': '#E6F6F5',
        },
        priority: {
          normal: '#22A06B',
          important: '#F5A524',
          urgent: '#E5484D',
        },
        dark: {
          bg: '#0B1220',
          card: '#111A2E',
          ink: '#F1F5F9',
          muted: '#94A3B8',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '24px',
        'xl': '16px',
      },
      boxShadow: {
        'soft': '0 10px 30px -5px rgba(14, 159, 154, 0.08)',
        'glow': '0 0 25px rgba(14, 159, 154, 0.4)',
      }
    },
  },
  plugins: [],
}
