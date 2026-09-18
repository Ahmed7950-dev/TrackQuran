/**
 * PushToggle — "get these on your phone" row inside the notification panel.
 *
 * One device at a time: whichever browser you press it in gets registered.
 * iOS only delivers web push to a Home Screen app, so that case is spelled out
 * rather than silently doing nothing.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  PushState, currentPushState, disablePush, enablePush, sendPushFor,
} from '../services/pushService';

const PushToggle: React.FC<{
  recipient: 'tutor' | 'student';
  teacherId: string;
  studentId?: string;
}> = ({ recipient, teacherId, studentId }) => {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const refresh = useCallback(() => { currentPushState().then(setState); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const turnOn = async () => {
    setBusy(true); setNote('');
    const res = await enablePush({ recipient, teacherId, studentId });
    setState(res.state);
    if (!res.ok && res.error) setNote(res.error);
    if (res.ok) setNote('This device will now ring for new notifications.');
    setBusy(false);
  };

  const turnOff = async () => {
    setBusy(true); setNote('');
    setState(await disablePush());
    setBusy(false);
  };

  const test = async () => {
    setBusy(true); setNote('');
    await sendPushFor({
      recipient, teacherId, studentId, test: true,
      title: 'LisanQuran',
      body: 'Test notification — this is how a new homework will look.',
      url: '/',
    });
    setNote('Sent — it should appear in a moment.');
    setBusy(false);
  };

  if (state === 'loading' || state === 'unsupported') return null;

  const wrap = 'px-4 py-2.5 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40';
  const isStudent = recipient === 'student';
  const what = isStudent
    ? 'New homework and your teacher\u2019s replies, even when the app is closed.'
    : 'A notification even when the app is closed.';

  if (state === 'needs-home-screen') {
    return (
      <div className={wrap}>
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Get these on your phone</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          On iPhone, tap Share → <span className="font-semibold">Add to Home Screen</span>, then open
          {isStudent ? ' your page from that icon' : ' LisanQuran from that icon'} and turn
          notifications on here.
        </p>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className={wrap}>
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Notifications are blocked</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
          Allow notifications for this site in your browser or iPhone settings, then come back.
        </p>
      </div>
    );
  }

  return (
    <div className={wrap}>
      <div className="flex items-center gap-2">
        <span className="text-base leading-none">{state === 'on' ? '🔔' : '🔕'}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            {state === 'on' ? 'Phone alerts are on for this device' : 'Get these on your phone'}
          </span>
          <span className="block text-[11px] text-slate-500 dark:text-slate-400">
            {state === 'on' ? 'Tap a notification to open it here.' : what}
          </span>
        </span>
        {state === 'on' ? (
          <>
            {!isStudent && <button onClick={test} disabled={busy}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-gray-600 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
              Test
            </button>}
            <button onClick={turnOff} disabled={busy}
              className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-gray-600 text-[11px] font-bold text-slate-500 hover:text-red-600 hover:border-red-200 disabled:opacity-50 transition-colors">
              Off
            </button>
          </>
        ) : (
          <button onClick={turnOn} disabled={busy}
            className="h-8 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-extrabold disabled:opacity-50 transition-colors">
            {busy ? 'Working…' : 'Turn on'}
          </button>
        )}
      </div>
      {note && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{note}</p>}
    </div>
  );
};

export default PushToggle;
