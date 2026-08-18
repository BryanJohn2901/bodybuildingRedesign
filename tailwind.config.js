/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      container: {
        center: true,
        padding: '1.5rem',
        screens: {
          sm: '640px',
          md: '768px',
          lg: '1024px',
          xl: '1300px',
          '2xl': '1300px',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        title: ['Oswald', 'sans-serif'],
      },
      colors: {
        brand: {
          bg: '#050505',
          surface: '#121212',
          primary: '#DC2626',
          primaryHover: '#B91C1C',
          textPrimary: '#FFFFFF',
          textSecondary: '#9CA3AF',
          accent: '#991B1B',
        },
      },
      backgroundImage: {
        mesh: 'radial-gradient(at 0% 0%, rgba(220, 38, 38, 0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(220, 38, 38, 0.05) 0px, transparent 50%)',
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite linear',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
};
