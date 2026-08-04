import React, { useMemo } from 'react';
import { Student, Mistake } from '../types';
import { MISTAKE_AREAS, ARABIC_LETTER_OF, classifyMistake } from './MistakeRing';
import { isLetterMistakeKey } from '../constants';

// ─────────────────────────────────────────────────────────────────────────────
// Mistake × session grid — every mistake type down the left, the student's last
// sessions across the top, one tiny cell each: red = made that mistake that
// session, green = clean. Letter recognition is broken out per letter, so a
// tutor can see at a glance which letter keeps coming back and which types have
// gone quiet.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SESSIONS = 20;

interface Row { label: string; hint?: string; group: string; color: string }

const dayOf = (iso: string) => (iso || '').slice(0, 10);

const MistakeSessionGrid: React.FC<{ student: Student }> = ({ student }) => {
  const { sessions, rows, hit } = useMemo(() => {
    const mistakes: Record<string, Mistake> = student.mistakes || {};

    // What counts as a session: any day the tutor logged something for this
    // student — attendance, reading/memorization progress, or a mistake.
    // Attendance alone would miss days logged without marking the register.
    const dayKeys = new Set<string>();
    for (const a of student.attendance ?? []) {
      if (a.status !== 'absent') dayKeys.add(dayOf(a.date));
    }
    for (const a of student.recitationAchievements ?? []) dayKeys.add(dayOf(a.date));
    for (const a of student.memorizationAchievements ?? []) dayKeys.add(dayOf(a.date));
    for (const [k, m] of Object.entries(mistakes)) {
      if (isLetterMistakeKey(k) && m.date) dayKeys.add(dayOf(m.date));
    }
    dayKeys.delete('');
    const sessions = [...dayKeys].sort().slice(-MAX_SESSIONS);
    const inWindow = new Set(sessions);

    // day → the set of mistake row-labels logged that day
    const hit = new Map<string, Set<string>>();
    const lettersSeen = new Map<string, string>();   // rowLabel → arabic letter
    const customSeen = new Set<string>();
    for (const [k, m] of Object.entries(mistakes)) {
      if (!isLetterMistakeKey(k)) continue;
      const day = dayOf(m.date);
      const cls = classifyMistake(m);
      if (!cls) continue;
      const label = cls.kind === 'letter' ? `letter:${cls.letter}` : cls.label;
      if (cls.kind === 'letter') lettersSeen.set(label, cls.letter);
      if (cls.kind === 'custom') customSeen.add(cls.label);
      if (!inWindow.has(day)) continue;   // outside the window: keeps the row, no cell
      if (!hit.has(day)) hit.set(day, new Set());
      hit.get(day)!.add(label);
    }

    // Rows: only mistakes this student actually made in the window. A type they
    // never made would be a row of pure green — true, but it buries the rows
    // that matter under the full taxonomy.
    const rows: Row[] = [];
    for (const area of MISTAKE_AREAS) {
      if (area.name === 'recognition') continue;   // expanded per letter below
      for (const sub of area.subs) rows.push({ label: sub, group: area.title, color: area.color });
    }
    const recog = MISTAKE_AREAS.find(a => a.name === 'recognition')!;
    [...lettersSeen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .forEach(([rowLabel, letter]) => {
        const arabic = ARABIC_LETTER_OF[letter] ?? '';
        rows.push({
          label: rowLabel,
          hint: arabic ? `${arabic}  ${letter}` : letter,
          group: recog.title,
          color: recog.color,
        });
      });
    [...customSeen].sort().forEach(label => rows.push({ label, group: 'Own notes', color: '#94a3b8' }));

    // drop every row that has no red cell in this window
    const madeInWindow = new Set<string>();
    hit.forEach(set => set.forEach(label => madeInWindow.add(label)));
    const kept = rows.filter(r => madeInWindow.has(r.label));

    return { sessions, rows: kept, hit };
  }, [student]);

  if (sessions.length === 0 || rows.length === 0) return null;

  const fmt = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return { top: dt.toLocaleDateString(undefined, { month: 'short' }), bottom: dt.getDate() };
  };

  let lastGroup = '';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-black text-slate-800 dark:text-slate-100">Mistake map</h3>
        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm inline-block bg-rose-500" /> made it</span>
          <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm inline-block bg-emerald-400" /> clean</span>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        Last {sessions.length} session{sessions.length === 1 ? '' : 's'} · newest on the right ·
        only mistakes actually made in this window are listed
      </p>

      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: '2px 2px' }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white dark:bg-gray-800" />
              {sessions.map(s => {
                const f = fmt(s);
                return (
                  <th key={s} title={s} className="align-bottom">
                    <div className="text-[8px] leading-[1.1] text-slate-400 dark:text-slate-500 font-semibold text-center w-4">
                      <div>{f.top}</div>
                      <div className="text-[9px] text-slate-600 dark:text-slate-300">{f.bottom}</div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const showGroup = row.group !== lastGroup;
              lastGroup = row.group;
              return (
                <React.Fragment key={`${row.group}-${row.label}`}>
                  {showGroup && (
                    <tr>
                      <td colSpan={sessions.length + 1} className="pt-2">
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: row.color }}>
                          {row.group}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="sticky left-0 z-10 bg-white dark:bg-gray-800 pr-3 whitespace-nowrap">
                      <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                        {row.hint ?? row.label}
                      </span>
                    </td>
                    {sessions.map(s => {
                      const made = hit.get(s)?.has(row.label) ?? false;
                      return (
                        <td key={s}>
                          <div
                            title={`${row.hint ?? row.label} · ${s} · ${made ? 'made this mistake' : 'clean'}`}
                            className={`w-4 h-4 rounded-[3px] ${made
                              ? 'bg-rose-500 dark:bg-rose-500'
                              : 'bg-emerald-400/70 dark:bg-emerald-500/60'}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MistakeSessionGrid;
