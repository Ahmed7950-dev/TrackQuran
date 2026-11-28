// components/PricingPage.tsx — public pricing page (no login required).
// The numbers come from utils/lessonPricing, shared with the landing page.

import React from 'react';
import LegalPage, { SUPPORT_EMAIL } from './LegalPage';
import { LESSON_PRICES, MIN_LESSONS_PER_MONTH } from '../utils/lessonPricing';

const FEATURES = [
  'Live, one-to-one online Quran lessons',
  'The same price for every student',
  'Qualified male and female teachers',
  'Homework, progress page and learning games included',
  'Lesson reminders on your phone',
];

const OPTIONS = [
  { minutes: 25 as const, note: 'Shorter lessons, ideal for children' },
  { minutes: 50 as const, note: 'A full lesson for steady progress' },
];

const PricingPage: React.FC = () => (
  <LegalPage
    title="Pricing"
    updated="28 November 2026"
    intro={
      <>
        One price for every student. Choose the lesson length, then how many lessons you want each
        month, starting from {MIN_LESSONS_PER_MONTH}. New students start with a free trial lesson.
      </>
    }
  >
    <div className="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
      {OPTIONS.map(o => (
        <div key={o.minutes} className="rounded-2xl border-2 border-teal-500/70 dark:border-teal-400/70 bg-white dark:bg-gray-800 shadow-sm p-7 text-center">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{o.minutes}-minute lesson</p>
          <div className="mt-3 flex items-baseline justify-center gap-1">
            <span className="text-5xl font-extrabold text-teal-700 dark:text-teal-300">${LESSON_PRICES[o.minutes]}</span>
            <span className="text-lg text-slate-400">/ lesson</span>
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{o.note}</p>
          <p className="mt-4 text-xs font-semibold text-slate-400 dark:text-slate-500">
            {MIN_LESSONS_PER_MONTH} lessons a month = ${LESSON_PRICES[o.minutes] * MIN_LESSONS_PER_MONTH}
          </p>
        </div>
      ))}
    </div>

    <div className="max-w-2xl mx-auto rounded-2xl bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 p-6">
      <ul className="space-y-2.5">
        {FEATURES.map(f => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="text-teal-500 mt-0.5">✓</span>{f}
          </li>
        ))}
      </ul>
      <a href="/join"
        className="mt-6 block text-center py-3 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors">
        Book a free trial
      </a>
    </div>

    <div className="space-y-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">How billing works.</span> A
        25-minute lesson is <strong>${LESSON_PRICES[25]}</strong> and a 50-minute lesson is{' '}
        <strong>${LESSON_PRICES[50]}</strong>. Plans are monthly and start at {MIN_LESSONS_PER_MONTH} lessons
        a month; you can take as many more as you like. Your monthly total is the number of lessons times
        the lesson price.
      </p>
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">Secure payments.</span> Payments
        are processed securely through trusted third-party payment processors. We do not store your card
        details on our servers.
      </p>
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">Questions?</span> Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 dark:text-teal-300 hover:underline">{SUPPORT_EMAIL}</a>{' '}
        and we'll be happy to help.
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Prices are in US dollars. Local taxes may be added at checkout depending on your country.
      </p>
    </div>
  </LegalPage>
);

export default PricingPage;
