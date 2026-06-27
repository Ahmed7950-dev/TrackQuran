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
    // StudentProgressPage builds `text-${fontSize}xl` dynamically (fontSize 2–8),
    // plus 'text-base' (fontSize 1 = 1rem, the phone default).
    // Build-time scanning can't see runtime-composed class names, so keep these.
    { pattern: /^text-[2-8]xl$/ },
    'text-base',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
