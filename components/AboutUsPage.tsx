// components/AboutUsPage.tsx
// ---------------------------------------------------------------------------
// About the platform — what it is and what it sets out to do.
//
// Deliberately about the WORK, not about any one person: no photograph, no
// name, no biography. Students, parents and other teachers all see this page,
// and it should read as a product rather than a personal profile.
// ---------------------------------------------------------------------------
import React from 'react';

const PILLARS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: '📖',
    title: 'Recitation and Tajweed',
    body: 'Read from the mushaf as it is printed, with every mistake marked on the exact letter it happened on, so progress is specific rather than general.',
  },
  {
    icon: '🔤',
    title: 'Arabic from the beginning',
    body: 'A structured course from the letters and their shapes through to reading and understanding, with vocabulary that is revised rather than simply met once.',
  },
  {
    icon: '🧩',
    title: 'Practice that children return to',
    body: 'Games and challenges built on the same words and letters the lessons use, so play and study reinforce one another instead of competing.',
  },
  {
    icon: '📈',
    title: 'A record worth keeping',
    body: 'Every lesson, mistake and revision is kept, so a teacher can see what a student actually needs and a family can see how far they have come.',
  },
];

const AboutUsPage: React.FC = () => (
  <div className="min-h-[60vh] flex flex-col items-center py-10 px-4">
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden w-full max-w-3xl">
      <div className="h-2 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />

      <div className="p-6 sm:p-10">
        <header className="text-center space-y-3">
          <h1 className="text-2xl sm:text-3xl font-black text-teal-700 dark:text-teal-400">
            About the platform
          </h1>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl mx-auto">
            A teaching platform for the Qur'an and the Arabic language, built for the
            lesson itself — for the teacher sitting with a student, page open, listening.
          </p>
        </header>

        <div className="border-t border-slate-100 dark:border-gray-700 my-8" />

        <div className="space-y-5 text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            Most learning tools stop at the material. This one is built around what
            happens in the lesson: what was read, where it faltered, what was set for
            next time, and whether it was done. Teaching the Qur'an has always relied on
            careful listening and patient correction, and the aim here is to support
            that work rather than replace it.
          </p>
          <p>
            Everything a student does — reading, memorising, reflecting, practising
            vocabulary, playing — is kept in one place, so the picture of their progress
            is a single thread rather than scattered notes.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-8">
          {PILLARS.map(p => (
            <div key={p.title}
              className="rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-900/30 p-4">
              <div className="text-2xl mb-2" aria-hidden="true">{p.icon}</div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">{p.title}</h2>
              <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 rounded-xl p-5 text-center mt-8">
          <p className="text-2xl sm:text-3xl text-teal-800 dark:text-teal-300 leading-loose"
            dir="rtl" style={{ fontFamily: 'var(--quranic-font, Hafs), serif' }}>
            ٱقۡرَأۡ بِٱسۡمِ رَبِّكَ ٱلَّذِي خَلَقَ
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Surah Al-'Alaq 96:1</p>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 pt-6 mt-6 border-t border-slate-100 dark:border-gray-700 text-center">
          © {new Date().getFullYear()} Lisan &amp; Quran. All rights reserved.
        </p>
      </div>
    </div>
  </div>
);

export default AboutUsPage;
