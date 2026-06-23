// components/PricingPage.tsx — public pricing page (no login required).

import React from 'react';
import LegalPage, { SUPPORT_EMAIL } from './LegalPage';

const FEATURES = [
  'Live, one-to-one online lessons',
  'Every lesson is 50 minutes long',
  'Same flat price for every student and subject (Arabic or Qur’an)',
  'Qualified male and female teachers',
  'Flexible scheduling — book lessons as you go',
  'Personal progress portal & lesson reminders',
];

const PricingPage: React.FC = () => (
  <LegalPage
    title="Pricing"
    intro={
      <>
        One simple, transparent rate for everyone — no tiers, no hidden fees. New students can start
        with a free trial lesson.
      </>
    }
  >
    {/* Single flat-rate card */}
    <div className="max-w-md mx-auto rounded-2xl border-2 border-teal-500 dark:border-teal-400 ring-2 ring-teal-500/20 bg-white dark:bg-gray-800 shadow-lg p-8 text-center">
      <span className="inline-block px-3 py-0.5 rounded-full bg-teal-600 text-white text-[11px] font-bold uppercase tracking-wide">
        One simple rate
      </span>
      <div className="mt-4 flex items-baseline justify-center gap-1">
        <span className="text-5xl font-extrabold text-teal-700 dark:text-teal-300">$15</span>
        <span className="text-lg text-slate-400">/ lesson</span>
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every lesson is 50 minutes long.</p>
      <ul className="mt-6 space-y-2.5 text-start">
        {FEATURES.map(f => (
          <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span className="text-teal-500 mt-0.5">✓</span>{f}
          </li>
        ))}
      </ul>
      <a
        href="/"
        className="mt-7 block text-center py-3 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors"
      >
        Book a free trial
      </a>
    </div>

    <div className="space-y-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">How billing works.</span> Lessons
        are <strong>$15 each</strong>, and every lesson runs for <strong>50 minutes</strong>. The rate is the
        same for every student and every subject — there are no packages or membership tiers.
      </p>
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">Secure payments.</span> Payments
        are securely processed by our authorized reseller and Merchant of Record,{' '}
        <strong>Paddle.com</strong>, which handles billing, receipts, and applicable taxes. We never see or
        store your full card details.
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
