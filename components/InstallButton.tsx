/**
 * InstallButton — "Add to Home Screen" in one tap where the platform allows it.
 *
 * Android / desktop Chrome & Edge: opens the browser's real install dialog.
 * iPhone / iPad: Apple provides no API, so it opens a short guide instead —
 * with an arrow at the Share button in Safari, and "open in Safari first"
 * when the page is inside another app's browser. Hidden once installed.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  InstallMode, installMode, iosBrowser, onInstallChange, promptInstall,
} from '../services/installService';

const PhoneIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path strokeLinecap="round" d="M12 8.5v6M9 11.5h6M10.5 18.5h3" />
  </svg>
);

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 inline-block align-[-4px]" aria-label="Share">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);

const AddIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 inline-block align-[-4px]" aria-label="Add">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path strokeLinecap="round" d="M12 8v8M8 12h8" />
  </svg>
);

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex gap-3 items-start">
    <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-sm font-black flex items-center justify-center flex-shrink-0">{n}</span>
    <span className="pt-0.5 text-[15px] leading-snug text-slate-700 dark:text-slate-200">{children}</span>
  </li>
);

const InstallButton: React.FC<{ variant?: 'icon' | 'row' }> = ({ variant = 'icon' }) => {
  const [mode, setMode] = useState<InstallMode>(() => installMode());
  const [guide, setGuide] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => onInstallChange(() => setMode(installMode())), []);

  if (mode === 'installed' || mode === 'none') return null;

  const start = async () => {
    if (mode === 'prompt') {
      const r = await promptInstall();
      if (r !== 'unavailable') return;
    }
    setGuide(true);
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const browser = iosBrowser();
  const isPhone = /iPhone|iPod/.test(navigator.userAgent);
  // Safari on an iPhone keeps Share in the bottom toolbar — point at it.
  const arrowAtBottom = mode === 'ios' && browser === 'safari' && isPhone;

  const where =
    browser === 'chrome' ? 'at the top right, next to the address bar'
    : browser === 'safari' ? (isPhone ? 'at the bottom of the screen' : 'at the top of the screen')
    : 'in the browser menu (⋯)';

  const trigger = variant === 'icon' ? (
    <button
      onClick={start}
      aria-label="Add to Home Screen"
      title="Add to Home Screen"
      className="relative p-1.5 sm:p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
    >
      <PhoneIcon />
    </button>
  ) : (
    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2">
      <span className="text-teal-600 dark:text-teal-400"><PhoneIcon className="w-5 h-5" /></span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">Add to Home Screen</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
          {mode === 'ios' || mode === 'ios-inapp'
            ? 'Needed on iPhone before notifications can arrive.'
            : 'Open LisanQuran like an app, in one tap.'}
        </span>
      </span>
      <button onClick={start}
        className="h-8 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-extrabold transition-colors">
        {mode === 'prompt' ? 'Install' : 'Show me'}
      </button>
    </div>
  );

  return (
    <>
      {trigger}

      {/* Portalled to <body>: opened from inside the notification panel, it
          would otherwise be clipped by the panel and stacked under its header. */}
      {guide && createPortal(
        <div data-install-guide className="fixed inset-0 z-[300] bg-slate-900/55 flex items-start sm:items-center justify-center p-4 pt-[12vh] sm:pt-4"
          onClick={() => setGuide(false)} role="dialog" aria-modal="true" aria-label="Add to Home Screen">
          <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-11 h-11 rounded-2xl overflow-hidden flex-shrink-0 shadow-sm">
                <img src="/icon-192.png" alt="" className="w-full h-full object-cover" />
              </span>
              <span className="min-w-0">
                <span className="block font-black text-slate-800 dark:text-white">Add LisanQuran to your Home Screen</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Opens like an app — and can show notifications.</span>
              </span>
            </div>

            {mode === 'ios-inapp' ? (
              <ol className="space-y-3">
                <Step n={1}>This page is open inside another app. Tap its <b>⋯</b> menu and choose <b>Open in Safari</b>.</Step>
                <Step n={2}>In Safari, tap this button again and follow the two steps.</Step>
              </ol>
            ) : mode === 'android-manual' ? (
              <ol className="space-y-3">
                <Step n={1}>Tap the browser menu <b>⋮</b> at the top right.</Step>
                <Step n={2}>Tap <b>Install app</b> or <b>Add to Home screen</b>.</Step>
                <Step n={3}>Open LisanQuran from the new icon.</Step>
              </ol>
            ) : (
              <ol className="space-y-3">
                <Step n={1}>Tap <b>Share</b> <ShareIcon /> {where}.</Step>
                <Step n={2}>Scroll down and tap <b>Add to Home Screen</b> <AddIcon />, then <b>Add</b>.</Step>
                <Step n={3}>Open LisanQuran from the new icon — then tap the bell to turn on notifications.</Step>
              </ol>
            )}

            {mode === 'ios' && (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 leading-snug">
                No <b>Add to Home Screen</b> in the list? The page is probably open inside another app, like
                WhatsApp — open it in Safari first.
              </p>
            )}

            <div className="mt-4 flex gap-2">
              {mode !== 'android-manual' && (
                <button onClick={copyLink}
                  className="flex-1 h-11 rounded-xl border border-slate-200 dark:border-gray-600 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
                  {copied ? 'Link copied ✓' : 'Copy link'}
                </button>
              )}
              <button onClick={() => setGuide(false)}
                className="flex-1 h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-black transition-colors">
                Got it
              </button>
            </div>
          </div>

          {arrowAtBottom && (
            // Centred by layout, not transform: animate-bounce animates
            // `transform`, which would wipe out a -translate-x-1/2 and shift the
            // arrow half its width right — onto the button next to Share.
            <div className="fixed inset-x-0 bottom-3 flex justify-center pointer-events-none">
              <div className="flex flex-col items-center text-white animate-bounce">
                <span className="text-xs font-black mb-1 drop-shadow whitespace-nowrap">Share is down here</span>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-8 h-8 drop-shadow">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m0 0-6-6m6 6 6-6" />
                </svg>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
};

export default InstallButton;
