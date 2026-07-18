/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#a855f7',
          dark: '#7c3aed',
        },
      },
    },
  },
  plugins: [],
};
