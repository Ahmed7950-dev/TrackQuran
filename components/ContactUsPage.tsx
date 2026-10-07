// components/ContactUsPage.tsx
// ---------------------------------------------------------------------------
// How to reach us. One address, said plainly, with the things worth saying in
// a first message so a reply can actually be useful.
// ---------------------------------------------------------------------------
import React, { useState } from 'react';

const EMAIL = 'ahmedalhajyousef95@gmail.com';

const REASONS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: '🎓',
    title: 'Lessons for a student',
    body: 'Qur\'an recitation, Tajweed, memorisation or Arabic. Tell us the age, the level and the days that suit you.',
  },
  {
    icon: '🧑‍🏫',
    title: 'Teaching on the platform',
    body: 'If you teach the Qur\'an or Arabic and would like an account, write and say a little about your experience.',
  },
  {
    icon: '🛠️',
    title: 'Something is not working',
    body: 'Tell us what you were doing and what happened. A screenshot helps more than anything else.',
  },
  {
    icon: '💡',
    title: 'An idea',
    body: 'Much of what is here began as a request from a teacher or a parent. Suggestions are read.',
  },
];

const ContactUsPage: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the address is on screen anyway */ }
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center py-10 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden w-full max-w-3xl">
        <div className="h-2 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />

        <div className="p-6 sm:p-10">
          <header className="text-center space-y-3">
            <h1 className="text-2xl sm:text-3xl font-black text-teal-700 dark:text-teal-400">
              Contact us
            </h1>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mx-auto">
              Questions about lessons, teaching on the platform, or anything that is not
              working as it should — write to us and we will reply.
            </p>
          </header>

          {/* The address */}
          <div className="mt-8 rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-900/20 p-5 sm:p-6 text-center space-y-4">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-teal-700/70 dark:text-teal-300/70">
              Email
            </p>
            <a href={`mailto:${EMAIL}`}
              className="block text-base sm:text-xl font-extrabold text-teal-800 dark:text-teal-200 underline decoration-teal-400/50 underline-offset-4 break-all hover:decoration-teal-500">
              {EMAIL}
            </a>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <a href={`mailto:${EMAIL}`}
                className="h-11 px-5 inline-flex items-center rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-extrabold">
                Write an email
              </a>
              <button type="button" onClick={copy}
                className="h-11 px-5 inline-flex items-center rounded-xl border border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-200 text-sm font-bold hover:bg-teal-100/60 dark:hover:bg-teal-900/40">
                {copied ? '✓ Copied' : 'Copy address'}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Messages are usually answered within a couple of days.
            </p>
          </div>

          {/* What to write about */}
          <div className="grid sm:grid-cols-2 gap-4 mt-8">
            {REASONS.map(r => (
              <div key={r.title}
                className="rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-900/30 p-4">
                <div className="text-2xl mb-2" aria-hidden="true">{r.icon}</div>
                <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">{r.title}</h2>
                <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{r.body}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-8 leading-relaxed">
            If you are writing about a student already learning here, please mention their
            name so we can find their record.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ContactUsPage;
