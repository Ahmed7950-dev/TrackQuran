// components/ContactUsPage.tsx
// ---------------------------------------------------------------------------
// How to reach us.
//
// Same editorial language as About: hairline rules, numbers, no emoji. The
// address is the centrepiece — set large on the dark band, because it is what
// the page is FOR, not a line of body text with a button underneath.
// ---------------------------------------------------------------------------
import React, { useState } from 'react';

const EMAIL = 'ahmedalhajyousef95@gmail.com';

const SERIF = "'Newsreader', Georgia, serif";
const SANS  = "'Karla', system-ui, sans-serif";

const T = {
  rule:   'border-[#D9D2C4] dark:border-gray-700',
  ink:    'text-[#10211C] dark:text-slate-50',
  body:   'text-[#3A4A44] dark:text-slate-300',
  muted:  'text-[#6B7A74] dark:text-slate-400',
  accent: 'text-[#1F6F5C] dark:text-teal-400',
};

const TOPICS: Array<{ n: string; title: string; body: string }> = [
  {
    n: '01',
    title: 'Lessons for a student',
    body: 'Qur\'an recitation, Tajweed, memorisation or Arabic. Tell us the age, the level, and the days that suit you.',
  },
  {
    n: '02',
    title: 'Teaching on the platform',
    body: 'If you teach the Qur\'an or Arabic and would like an account, say a little about your experience.',
  },
  {
    n: '03',
    title: 'Something is not working',
    body: 'Tell us what you were doing and what happened. A screenshot helps more than anything else.',
  },
  {
    n: '04',
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
    <div style={{ fontFamily: SANS }}
      className="rounded-2xl overflow-hidden bg-[#F7F4ED] dark:bg-[#0E1A17] border border-[#E4DED2] dark:border-gray-700 shadow-sm">

      {/* Masthead */}
      <div className="max-w-[1120px] mx-auto px-5 sm:px-10">
        <div className="flex flex-wrap items-baseline gap-4 pt-7">
          <span className={`text-[11px] font-bold uppercase tracking-[0.22em] ${T.accent}`}>Lisan &amp; Quran</span>
          <span className="flex-grow" />
          <span className={`text-[11px] uppercase tracking-[0.12em] ${T.muted}`}>Contact</span>
        </div>
        <div className={`h-px mt-4 border-t ${T.rule}`} />
      </div>

      {/* Opening */}
      <div className="max-w-[1120px] mx-auto px-5 sm:px-10">
        <div className="pt-12 sm:pt-16 pb-12">
          <h1 style={{ fontFamily: SERIF }}
            className={`m-0 font-light text-[clamp(34px,6vw,64px)] leading-[1.08] tracking-[-0.02em] ${T.ink}`}>
            Write to us.
          </h1>
          <p className={`mt-6 max-w-[32em] text-[17px] sm:text-[19px] leading-[1.62] ${T.body}`}>
            About lessons, about teaching here, or about something that is not working
            as it should. Every message is read, and answered.
          </p>
        </div>
      </div>

      {/* The address, as the centrepiece */}
      <div className="bg-[#10211C] dark:bg-black/40 text-[#F3EFE4]">
        <div className="max-w-[1120px] mx-auto px-5 sm:px-10">
          <div className="flex flex-wrap items-center gap-8 py-12 sm:py-16">

            <div className="flex-[999_1_420px] min-w-0">
              <p className="m-0 mb-3.5 text-[11px] uppercase tracking-[0.2em] text-[#8FA79E]">Email</p>
              <a href={`mailto:${EMAIL}`}
                style={{ fontFamily: SERIF }}
                className="inline-block font-normal text-[clamp(21px,3.4vw,38px)] leading-[1.2] tracking-[-0.01em] text-[#F3EFE4] no-underline border-b border-[#3E5850] pb-1.5 break-words hover:border-[#8FA79E] transition-colors">
                {EMAIL}
              </a>
              <p className="mt-5 text-[14.5px] leading-[1.6] text-[#9FB4AC]">
                Messages are usually answered within a couple of days.
              </p>
            </div>

            <div className="flex-[1_1_220px] min-w-0 flex flex-col gap-3">
              <a href={`mailto:${EMAIL}`}
                className="h-[52px] px-6 rounded-sm bg-[#F3EFE4] text-[#10211C] text-[15px] font-bold flex items-center justify-center hover:bg-white transition-colors">
                Write an email
              </a>
              <button type="button" onClick={copy}
                style={{ fontFamily: SANS }}
                className="h-[52px] px-6 rounded-sm bg-transparent border border-[#3E5850] text-[#D7E2DD] text-[15px] font-bold hover:bg-white/5 transition-colors">
                {copied ? '✓ Copied' : 'Copy address'}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* What people write about */}
      <div className="max-w-[1120px] mx-auto px-5 sm:px-10 pb-14">
        <div className="pt-14 pb-2">
          <h2 style={{ fontFamily: SERIF }}
            className={`m-0 font-normal text-[25px] sm:text-[28px] leading-[1.25] ${T.ink}`}>
            What people usually write about
          </h2>
        </div>

        <div className="flex flex-wrap gap-x-8 lg:gap-x-12">
          {TOPICS.map(topic => (
            <section key={topic.n}
              className={`flex-[1_1_400px] min-w-0 py-8 border-t ${T.rule}`}>
              <div className="flex gap-5 items-baseline">
                <span style={{ fontFamily: SERIF }}
                  className={`text-[15px] tracking-[0.08em] flex-shrink-0 ${T.accent}`}>{topic.n}</span>
                <div className="min-w-0">
                  <h3 className={`m-0 mb-2 text-[16px] font-bold ${T.ink}`}>{topic.title}</h3>
                  <p className={`m-0 text-[15.5px] leading-[1.68] ${T.body}`}>{topic.body}</p>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className={`h-px border-t ${T.rule}`} />
        <p style={{ fontFamily: SERIF }}
          className={`mt-7 max-w-[46em] italic text-[17px] sm:text-[18px] leading-[1.6] ${T.muted}`}>
          If you are writing about a student already learning here, please mention their
          name so we can find their record.
        </p>
      </div>

      {/* Foot */}
      <div className="max-w-[1120px] mx-auto px-5 sm:px-10">
        <div className={`flex flex-wrap items-center gap-4 py-8 border-t ${T.rule}`}>
          <span className={`text-[13.5px] ${T.muted}`}>
            © {new Date().getFullYear()} Lisan &amp; Quran. All rights reserved.
          </span>
        </div>
      </div>
    </div>
  );
};

export default ContactUsPage;
