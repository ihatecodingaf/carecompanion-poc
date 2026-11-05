/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0a0a12',
          card: '#12121e',
          elevated: '#1a1a2e',
          border: 'rgba(255,255,255,0.08)',
        },
        brand: {
          DEFAULT: '#7c3aed',
          light: '#a78bfa',
          dark: '#5b21b6',
          glow: 'rgba(124,58,237,0.25)',
        },
        status: {
          green: '#10b981',
          yellow: '#f59e0b',
          red: '#ef4444',
          'green-bg': 'rgba(16,185,129,0.12)',
          'yellow-bg': 'rgba(245,158,11,0.12)',
          'red-bg': 'rgba(239,68,68,0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
        glow: '0 0 20px rgba(124,58,237,0.3)',
        'glow-green': '0 0 20px rgba(16,185,129,0.25)',
        'glow-red': '0 0 20px rgba(239,68,68,0.25)',
      },
    },
  },
  plugins: [],
};
