import React from 'react';

const AboutUsPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center py-10 px-4">
      {/* Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden w-full max-w-3xl">

        {/* Decorative top banner */}
        <div className="h-2 bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400" />

        <div className="p-6 sm:p-10">
          {/* Profile picture + name */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
            <div className="flex-shrink-0">
              <img
                src="/About us profile picture.jpg"
                alt="Ustadth Ahmed Yousuf"
                className="w-36 h-36 sm:w-44 sm:h-44 rounded-full object-cover shadow-md border-4 border-teal-100 dark:border-teal-900"
                onError={e => {
                  // Fallback: show initials avatar if image not found
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const parent = (e.currentTarget as HTMLImageElement).parentElement;
                  if (parent && !parent.querySelector('.avatar-fallback')) {
                    const div = document.createElement('div');
                    div.className = 'avatar-fallback w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-teal-100 dark:bg-teal-900 flex items-center justify-center text-4xl font-bold text-teal-700 dark:text-teal-300 shadow-md border-4 border-teal-100 dark:border-teal-800';
                    div.textContent = 'أ';
                    parent.appendChild(div);
                  }
                }}
              />
            </div>

            <div className="text-center sm:text-left">
              <h1 className="text-2xl sm:text-3xl font-bold text-teal-700 dark:text-teal-400 mb-1">
                Ustadth Ahmed Yousuf
              </h1>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-2">
                {['Web Developer', 'Quran Teacher', 'Arabic Teacher', 'Imam'].map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-0.5 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs font-semibold rounded-full border border-teal-200 dark:border-teal-700"
                  >
                    {tag}
                  </span>
                ))}
                <span className="px-3 py-0.5 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-full border border-emerald-200 dark:border-emerald-700">
                  🇵🇸 Palestine
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 dark:border-gray-700 mb-8" />

          {/* About text */}
          <div className="space-y-5 text-slate-700 dark:text-slate-300 leading-relaxed text-base sm:text-[1.05rem]">
            <p>
              This platform was developed by <strong className="text-teal-700 dark:text-teal-400">Ustadth Ahmed Yousuf</strong>, a web developer, Quran and Arabic teacher, and Imam from Palestine, who strives to make learning the Holy Quran and the Arabic language accessible to every home through modern educational methods and contemporary technologies.
            </p>

            <p>
              The platform aims to provide an interactive learning experience that helps students achieve real progress in Quran recitation, Tajweed, and the Arabic language, while also training teachers to use innovative and effective teaching methods.
            </p>

            <p>
              The platform was launched in <strong className="text-teal-700 dark:text-teal-400">2026</strong> and is continuously being developed to improve the user experience and add more educational tools and content.
            </p>

            {/* Decorative Quranic quote */}
            <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800 rounded-xl p-4 text-center mt-6">
              <p
                className="text-2xl sm:text-3xl text-teal-800 dark:text-teal-300 leading-loose"
                dir="rtl"
                style={{ fontFamily: 'var(--quranic-font, Hafs), serif' }}
              >
                ٱقۡرَأۡ بِٱسۡمِ رَبِّكَ ٱلَّذِي خَلَقَ
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Surah Al-Alaq 96:1</p>
            </div>

            {/* Copyright */}
            <p className="text-sm text-slate-500 dark:text-slate-400 pt-4 border-t border-slate-100 dark:border-gray-700">
              All rights reserved to <strong>Ahmed Yousif</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutUsPage;
