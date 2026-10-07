// components/ThemeIcon.tsx
// -----------------------------------------------------------------------------
// The glyph on the theme toggle: one per look, so the button says which one you
// are in. Four of them now, which is one too many to keep inlining at every
// call site.
// -----------------------------------------------------------------------------
import React from 'react';
import { AppTheme } from '../utils/theme';

const ThemeIcon: React.FC<{ theme: AppTheme; className?: string }> = ({ theme, className = 'w-5 h-5' }) => {
  const common = {
    xmlns: 'http://www.w3.org/2000/svg', fill: 'none', viewBox: '0 0 24 24',
    strokeWidth: 1.5, stroke: 'currentColor', className, 'aria-hidden': true,
  } as const;

  // Sun — light
  if (theme === 'light') return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>
  );

  // Open book — reading
  if (theme === 'reading') return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
  );

  // Moon — dark
  if (theme === 'dark') return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.921-.994 6.697-2.648Z" /></svg>
  );

  // Lamp throwing light — amber. A projector bulb, which is where the look
  // came from, and clearly not another moon.
  return (
    <svg {...common}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 16.5a5.5 5.5 0 1 1 5 0v1.75a1.25 1.25 0 0 1-1.25 1.25h-2.5A1.25 1.25 0 0 1 9.5 18.25z" />
      <path strokeLinecap="round" d="M10.25 21.5h3.5" />
    </svg>
  );
};

export default ThemeIcon;
