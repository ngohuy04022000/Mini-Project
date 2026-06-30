/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf2f8',
          100: '#fce7f3',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          900: '#831843',
        },
        concert: {
          dark: '#0a0a0f',
          card: '#12121a',
          border: '#2a2a3a',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'countdown-tick': 'countdownTick 1s ease-in-out infinite',
      },
      keyframes: {
        countdownTick: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
};
