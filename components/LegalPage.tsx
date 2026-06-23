// components/LegalPage.tsx
// Shared layout + building blocks for the public, no-login policy pages
// (Pricing, Terms, Privacy, Refunds). Linked from the landing footer.

import React from 'react';
import Logo from './Logo';

export const SITE_NAME = 'LisanQuran';
export const SUPPORT_EMAIL = 'support@lisanquran.com';

export const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refunds', label: 'Refund Policy' },
];

export const Section: React.FC<{ heading: string; children: React.ReactNode }> = ({ heading, children }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-bold text-slate-900 dark:text-white">{heading}</h2>
    <div className="space-y-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
  </section>
);

export const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc ps-5 space-y-1.5">
    {items.map((it, i) => <li key={i}>{it}</li>)}
  </ul>
);

const LegalPage: React.FC<{ title: string; intro?: React.ReactNode; updated?: string; children: React.ReactNode }> = ({
  title, intro, updated, children,
}) => (
  <div className="min-h-screen bg-slate-50 dark:bg-gray-900 text-slate-800 dark:text-slate-200 flex flex-col" dir="ltr">
    {/* Header */}
    <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 sticky top-0 z-40">
      <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <a href="/" className="flex items-center" aria-label="Home"><Logo /></a>
        <a href="/" className="flex-shrink-0 text-sm font-semibold text-teal-700 dark:text-teal-300 hover:underline">← Home</a>
      </div>
    </header>

    {/* Content */}
    <main className="flex-1 w-full max-w-3xl mx-auto px-5 py-10">
      <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">{title}</h1>
      {updated && <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500">Last updated: {updated}</p>}
      {intro && <div className="mt-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{intro}</div>}
      <div className="mt-8 space-y-8">{children}</div>
    </main>

    {/* Footer with cross-links */}
    <footer className="bg-white dark:bg-gray-800 border-t border-slate-200 dark:border-gray-700">
      <div className="max-w-3xl mx-auto px-5 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <p className="text-slate-400 dark:text-slate-500">© {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {LEGAL_LINKS.map(l => (
            <a key={l.href} href={l.href} className="text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-300 transition-colors">{l.label}</a>
          ))}
        </nav>
      </div>
    </footer>
  </div>
);

export default LegalPage;
