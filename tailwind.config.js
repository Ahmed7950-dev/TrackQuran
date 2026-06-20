/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './context/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  // Matches the previous CDN config (`tailwind.config = { darkMode: 'class' }`).
  darkMode: 'class',
  safelist: [
    // StudentProgressPage builds `text-${fontSize}xl` dynamically (fontSize 2–8).
    // Build-time scanning can't see runtime-composed class names, so keep these.
    { pattern: /^text-[2-8]xl$/ },
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
