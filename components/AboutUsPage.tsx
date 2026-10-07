// components/AboutUsPage.tsx
// ---------------------------------------------------------------------------
// About the platform.
//
// Editorial rather than card-and-emoji: left-aligned type, hairline rules,
// numbers instead of icons, and one dark band where the ayah can breathe.
// Newsreader for display, Karla for text, Amiri for the Arabic.
//
// Deliberately about the WORK, not about any one person — no photograph, no
// name, no biography. Everyone who opens a portal link sees this page.
// ---------------------------------------------------------------------------
import React from 'react';

const SERIF = "'Newsreader', Georgia, serif";
const SANS  = "'Karla', system-ui, sans-serif";

/** Paper and ink, with a night side. The accent is the one colour. */
const T = {
  rule:   'border-[#D9D2C4] dark:border-gray-700',
  ink:    'text-[#10211C] dark:text-slate-50',
  body:   'text-[#3A4A44] dark:text-slate-300',
  muted:  'text-[#6B7A74] dark:text-slate-400',
  accent: 'text-[#1F6F5C] dark:text-teal-400',
};

const WORK: Array<{ n: string; title: string; body: string }> = [
  {
    n: '01',
    title: 'Recitation and Tajweed',
    body: 'Read from the mushaf as it is printed, with every mistake marked on the exact letter it happened on.',
  },
  {
    n: '02',
    title: 'Arabic from the beginning',
    body: 'The letters and their shapes through to reading and understanding, with vocabulary that is revised rather than simply met once.',
  },
  {
    n: '03',
    title: 'Practice children return to',
    body: 'Games built on the same words and letters the lessons use, so play and study reinforce one another instead of competing.',
  },
  {
    n: '04',
    title: 'A record worth keeping',
    body: 'Every lesson, mistake and revision is kept, so a teacher sees what a student needs and a family sees how far they have come.',
  },
];

const AboutUsPage: React.FC = () => (
  <div style={{ fontFamily: SANS }}
    className="rounded-2xl overflow-hidden bg-[#F7F4ED] dark:bg-[#0E1A17] border border-[#E4DED2] dark:border-gray-700 shadow-sm">

    {/* Masthead */}
    <div className="max-w-[1120px] mx-auto px-5 sm:px-10">
      <div className="flex flex-wrap items-baseline gap-4 pt-7">
        <span className={`text-[11px] font-bold uppercase tracking-[0.22em] ${T.accent}`}>Lisan &amp; Quran</span>
        <span className="flex-grow" />
        <span className={`text-[11px] uppercase tracking-[0.12em] ${T.muted}`}>About the platform</span>
      </div>
      <div className={`h-px mt-4 border-t ${T.rule}`} />
    </div>

    {/* Opening statement */}
    <div className="max-w-[1120px] mx-auto px-5 sm:px-10">
      <div className="flex flex-wrap gap-8 lg:gap-12 pt-12 sm:pt-16 pb-12">
        <div className="flex-[999_1_460px] min-w-0">
          <h1 style={{ fontFamily: SERIF }}
            className={`m-0 font-light text-[clamp(34px,6vw,64px)] leading-[1.08] tracking-[-0.02em] ${T.ink}`}>
            Built for the lesson,<br className="hidden sm:inline" /> not the library.
          </h1>
          <p className={`mt-7 max-w-[34em] text-[17px] sm:text-[19px] leading-[1.62] ${T.body}`}>
            A teaching platform for the Qur'an and the Arabic language, shaped around
            the hour a teacher spends with a student — page open, listening.
          </p>
        </div>
        <div className="flex-[1_1_240px] min-w-0 self-end">
          <p style={{ fontFamily: SERIF }}
            className={`m-0 italic text-[18px] sm:text-[20px] leading-[1.55] ${T.muted}`}>
            Teaching the Qur'an has always rested on careful listening and patient
            correction. The aim here is to serve that work, not to replace it.
          </p>
        </div>
      </div>
    </div>

    {/* Two columns of prose */}
    <div className="max-w-[1120px] mx-auto px-5 sm:px-10">
      <div className={`h-px border-t ${T.rule}`} />
      <div className="flex flex-wrap gap-8 lg:gap-12 py-12">
        <p className={`flex-[1_1_360px] min-w-0 m-0 text-[16px] sm:text-[17px] leading-[1.72] ${T.body}`}>
          Most learning tools stop at the material. This one begins with what happens
          in the room: what was read, where it faltered, what was set for next time,
          and whether it was done. A mistake is marked on the letter it happened on,
          so progress is specific rather than general.
        </p>
        <p className={`flex-[1_1_360px] min-w-0 m-0 text-[16px] sm:text-[17px] leading-[1.72] ${T.body}`}>
          Everything a student does — reading, memorising, reflecting, practising
          vocabulary, playing — is kept in one place. The picture of their year is a
          single thread rather than scattered notes, for the teacher and for the
          family alike.
        </p>
      </div>
    </div>

    {/* What it does */}
    <div className="max-w-[1120px] mx-auto px-5 sm:px-10 pb-14">
      <div className={`h-px border-t ${T.rule}`} />
      <div className="flex flex-wrap gap-x-8 lg:gap-x-12">
        {WORK.map(w => (
          <section key={w.n}
            className={`flex-[1_1_400px] min-w-0 py-8 border-b ${T.rule}`}>
            <div className="flex gap-5 items-baseline">
              <span style={{ fontFamily: SERIF }}
                className={`text-[15px] tracking-[0.08em] flex-shrink-0 ${T.accent}`}>{w.n}</span>
              <div className="min-w-0">
                <h2 style={{ fontFamily: SERIF }}
                  className={`m-0 mb-2 font-normal text-[22px] sm:text-[25px] leading-[1.25] ${T.ink}`}>{w.title}</h2>
                <p className={`m-0 text-[15.5px] leading-[1.68] ${T.body}`}>{w.body}</p>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>

    {/* The ayah, given room */}
    <div className="bg-[#10211C] dark:bg-black/40 text-[#F3EFE4]">
      <div className="max-w-[1120px] mx-auto px-5 sm:px-10 py-16 sm:py-20 text-center">
        <p lang="ar" dir="rtl"
          style={{ fontFamily: "'Amiri', Georgia, serif" }}
          className="m-0 text-[clamp(30px,5.4vw,54px)] leading-[1.9] text-[#F3EFE4]">
          ٱقۡرَأۡ بِٱسۡمِ رَبِّكَ ٱلَّذِي خَلَقَ
        </p>
        <p className="mt-7 text-[11px] uppercase tracking-[0.2em] text-[#8FA79E]">
          Surah Al-'Alaq · 96:1
        </p>
      </div>
    </div>

    {/* Foot */}
    <div className="max-w-[1120px] mx-auto px-5 sm:px-10">
      <div className="flex flex-wrap items-center gap-4 py-8">
        <span className={`text-[13.5px] ${T.muted}`}>
          © {new Date().getFullYear()} Lisan &amp; Quran. All rights reserved.
        </span>
      </div>
    </div>
  </div>
);

export default AboutUsPage;
