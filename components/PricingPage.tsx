// components/PricingPage.tsx — public pricing page (no login required).

import React from 'react';
import LegalPage, { SUPPORT_EMAIL } from './LegalPage';

interface Plan {
  name: string;
  price: string;
  per: string;
  sessions: string;
  features: string[];
  featured?: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Seedling',
    price: '$49',
    per: '/month',
    sessions: '4 sessions / month',
    features: ['30-minute one-to-one sessions', 'One subject (Quran or Arabic)', 'Progress tracking & student portal'],
  },
  {
    name: 'Scholar',
    price: '$89',
    per: '/month',
    sessions: '8 sessions / month',
    features: ['45-minute one-to-one sessions', 'Two subjects', 'Priority scheduling', 'Monthly progress report'],
    featured: true,
  },
  {
    name: 'Companion',
    price: '$149',
    per: '/month',
    sessions: '16 sessions / month',
    features: ['60-minute one-to-one sessions', 'All subjects', 'Dedicated teacher', 'Family plan eligible'],
  },
];

const PricingPage: React.FC = () => (
  <LegalPage
    title="Pricing"
    intro={
      <>
        Simple, transparent monthly plans for one-to-one online Quran and Arabic lessons — including
        live sessions, progress tracking, and your personal student portal. No hidden fees, cancel
        anytime. New students can start with a free trial lesson.
      </>
    }
  >
    {/* Plan cards */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {PLANS.map(plan => (
        <div
          key={plan.name}
          className={`rounded-2xl p-6 border flex flex-col ${
            plan.featured
              ? 'border-teal-500 dark:border-teal-400 ring-2 ring-teal-500/30 bg-white dark:bg-gray-800 shadow-lg'
              : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800'
          }`}
        >
          {plan.featured && (
            <span className="self-start mb-3 px-2.5 py-0.5 rounded-full bg-teal-600 text-white text-[11px] font-bold uppercase tracking-wide">
              Most popular
            </span>
          )}
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-teal-700 dark:text-teal-300">{plan.price}</span>
            <span className="text-sm text-slate-400">{plan.per}</span>
          </div>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{plan.sessions}</p>
          <ul className="mt-4 space-y-2 flex-1">
            {plan.features.map(f => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                <span className="text-teal-500 mt-0.5">✓</span>{f}
              </li>
            ))}
          </ul>
          <a
            href="/"
            className={`mt-6 block text-center py-2.5 rounded-xl text-sm font-bold transition-colors ${
              plan.featured
                ? 'bg-teal-600 text-white hover:bg-teal-700'
                : 'border border-teal-600 text-teal-700 dark:text-teal-300 dark:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20'
            }`}
          >
            Get started
          </a>
        </div>
      ))}
    </div>

    <div className="space-y-3 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">Billing.</span> Plans are billed
        monthly and renew automatically until cancelled. You can cancel at any time from your account or by
        contacting us; your plan stays active until the end of the current billing period.
      </p>
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">Secure payments.</span> Payments
        are securely processed by our authorized reseller and Merchant of Record, <strong>Paddle.com</strong>.
        Paddle handles billing, receipts, and applicable taxes. We never see or store your full card details.
      </p>
      <p>
        <span className="font-semibold text-slate-800 dark:text-slate-100">Custom & family plans.</span> Need a
        different number of sessions, a sibling/family plan, or a tailored schedule? Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-teal-600 dark:text-teal-300 hover:underline">{SUPPORT_EMAIL}</a>{' '}
        and we'll arrange a plan that fits.
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Prices are in US dollars. Local taxes may be added at checkout depending on your country.
      </p>
    </div>
  </LegalPage>
);

export default PricingPage;
