// services/lettersHunterHomeworkService.ts
// -----------------------------------------------------------------------------
// The hunt, sent home.
//
// Three rounds of the seven go: spot the letter, sound discrimination, and
// write. The other four need someone listening to the student read, so they
// stay in the lesson.
//
// The first two mark themselves — he taps the cells, the app knows which were
// right — and the drawings wait for the tutor, who looks at them, draws on them
// and decides. So a handed-in piece of homework is half marked on arrival, and
// the mark the student sees only appears once the tutor has finished.
//
// The student has no session, so everything his side does goes through the
// security-definer functions in 20261101_letters_hunter_homework.sql rather
// than an open table. See that file for why.
// -----------------------------------------------------------------------------
import { supabase } from '../lib/supabase';
import { createNotification } from './notificationService';
import type { SubId, SubScore, HunterPlan } from './lettersHunterService';
import type { Stroke } from './hunterBoardService';

export type HunterVerdict = 'right' | 'better' | 'wrong';
export type HunterHomeworkStatus = 'assigned' | 'submitted' | 'marked';

/** One letter the student was asked to write, and what came of it. */
export interface HunterDrawing {
  letter: string;
  strokes: Stroke[];
  /** The tutor's ink, added while marking. */
  tutorStrokes?: Stroke[];
  verdict?: HunterVerdict;
}

export interface HunterHomework {
  id: string;
  teacherId: string;
  studentId: string;
  studentName: string | null;
  letters: string[];
  plan: HunterPlan;
  dueAt: string | null;
  status: HunterHomeworkStatus;
  autoRight: number | null;
  autoTotal: number | null;
  autoDetail: SubScore[] | null;
  drawings: HunterDrawing[] | null;
  createdAt: string;
  submittedAt: string | null;
  markedAt: string | null;
}

type Row = {
  id: string; teacher_id: string; student_id: string; student_name: string | null;
  letters: string[]; plan: HunterPlan; due_at: string | null; status: HunterHomeworkStatus;
  auto_right: number | null; auto_total: number | null; auto_detail: SubScore[] | null;
  drawings: HunterDrawing[] | null;
  created_at: string; submitted_at: string | null; marked_at: string | null;
};

const fromRow = (r: Row): HunterHomework => ({
  id: r.id, teacherId: r.teacher_id, studentId: r.student_id, studentName: r.student_name,
  letters: r.letters ?? [], plan: r.plan, dueAt: r.due_at, status: r.status,
  autoRight: r.auto_right, autoTotal: r.auto_total, autoDetail: r.auto_detail,
  drawings: r.drawings, createdAt: r.created_at, submittedAt: r.submitted_at, markedAt: r.marked_at,
});

export const HUNTER_SITE = 'https://www.lisanquran.com';
export const hunterHomeworkUrl = (id: string): string => `${HUNTER_SITE}/hunt/${id}`;

/** The rounds that can be done alone, in the order they are played. */
export const HOMEWORK_SUBS: SubId[] = ['spot', 'sounds', 'write'];

/* ── The tutor sets it ───────────────────────────────────────────────────── */

export async function createHunterHomework(input: {
  teacherId: string; studentId: string; studentName?: string;
  letters: string[]; plan: HunterPlan; dueAt: string | null;
}): Promise<HunterHomework | null> {
  const { data, error } = await supabase.from('letters_hunter_homework').insert({
    teacher_id: input.teacherId,
    student_id: input.studentId,
    student_name: input.studentName ?? null,
    letters: input.letters,
    plan: input.plan,
    due_at: input.dueAt,
  }).select('*').single();
  // A save that fails must say so — a silent one cost this project two months
  // of lost Arabic edits.
  if (error) { console.error('createHunterHomework:', error.message); return null; }

  const hw = fromRow(data as Row);
  await createNotification({
    teacherId: hw.teacherId,
    studentId: hw.studentId,
    recipient: 'student',
    bookingId: null,
    type: 'hunter_homework_assigned',
    title: 'New homework: letters hunter',
    body: `${hw.letters.join(' ')} — ${hw.dueAt ? `due ${new Date(hw.dueAt).toLocaleDateString()}` : 'no deadline'}`,
    metadata: { homeworkId: hw.id, url: hunterHomeworkUrl(hw.id) },
  });
  return hw;
}

/** The tutor's own list for one student. */
export async function listHunterHomework(studentId: string): Promise<HunterHomework[]> {
  const { data, error } = await supabase.from('letters_hunter_homework')
    .select('*').eq('student_id', studentId).order('created_at', { ascending: false });
  if (error) { console.error('listHunterHomework:', error.message); return []; }
  return (data as Row[]).map(fromRow);
}

/* ── The student's side, through the functions ───────────────────────────── */

export async function listHunterHomeworkForStudent(studentId: string): Promise<HunterHomework[]> {
  const { data, error } = await supabase.rpc('list_hunter_homework', { p_student: studentId });
  if (error) { console.error('listHunterHomeworkForStudent:', error.message); return []; }
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function getHunterHomework(id: string): Promise<HunterHomework | null> {
  const { data, error } = await supabase.rpc('get_hunter_homework', { p_id: id });
  if (error) { console.error('getHunterHomework:', error.message); return null; }
  const rows = (data ?? []) as Row[];
  return rows.length ? fromRow(rows[0]) : null;
}

/** Handing it in. Returns false when it was already handed in. */
export async function submitHunterHomework(
  hw: HunterHomework, right: number, total: number, detail: SubScore[], drawings: HunterDrawing[],
): Promise<boolean> {
  const { data, error } = await supabase.rpc('submit_hunter_homework', {
    p_id: hw.id, p_right: right, p_total: total, p_detail: detail, p_drawings: drawings,
  });
  if (error) { console.error('submitHunterHomework:', error.message); return false; }
  if (data !== true) return false;      // someone got there first

  await createNotification({
    teacherId: hw.teacherId,
    studentId: hw.studentId,
    recipient: 'tutor',
    bookingId: null,
    type: 'hunter_homework_submitted',
    title: 'Letters hunter handed in',
    body: `${hw.studentName ?? 'Your student'} finished ${hw.letters.join(' ')} — ${right}/${total} marked by itself`
      + (drawings.length ? `, ${drawings.length} drawing${drawings.length === 1 ? '' : 's'} for you` : ''),
    metadata: { homeworkId: hw.id },
  });
  return true;
}

/* ── The tutor marks the drawings ────────────────────────────────────────── */

export async function markHunterHomework(hw: HunterHomework, drawings: HunterDrawing[]): Promise<boolean> {
  // `.select()` is what makes a refused write visible: an update the row-level
  // policy rejects comes back with no error AND no rows, so without asking for
  // the row back this would report success and the tutor would think the mark
  // was sent. The same silence lost two months of Arabic edits once.
  const { data, error } = await supabase.from('letters_hunter_homework')
    .update({ drawings, status: 'marked', marked_at: new Date().toISOString() })
    .eq('id', hw.id)
    .select('id');
  if (error) { console.error('markHunterHomework:', error.message); return false; }
  if (!data || data.length === 0) { console.error('markHunterHomework: nothing was updated'); return false; }

  const right = drawings.filter(d => d.verdict === 'right').length;
  await createNotification({
    teacherId: hw.teacherId,
    studentId: hw.studentId,
    recipient: 'student',
    bookingId: null,
    type: 'hunter_homework_marked',
    title: 'Your letters hunter is marked',
    body: `${hw.letters.join(' ')} — ${(hw.autoRight ?? 0) + right} of ${(hw.autoTotal ?? 0) + drawings.length} right`,
    metadata: { homeworkId: hw.id, url: hunterHomeworkUrl(hw.id) },
  });
  return true;
}

export async function deleteHunterHomework(id: string): Promise<void> {
  const { error } = await supabase.from('letters_hunter_homework').delete().eq('id', id);
  if (error) console.error('deleteHunterHomework:', error.message);
}

/* ── Reading one ─────────────────────────────────────────────────────────── */

/** The whole mark, once the tutor has been through the drawings. */
export const hunterMark = (hw: HunterHomework): { right: number; total: number } | null => {
  if (hw.status !== 'marked') return null;
  const drawn = hw.drawings ?? [];
  return {
    right: (hw.autoRight ?? 0) + drawn.filter(d => d.verdict === 'right').length,
    total: (hw.autoTotal ?? 0) + drawn.length,
  };
};

export const dueLabel = (hw: HunterHomework): string => {
  if (!hw.dueAt) return 'no deadline';
  const ms = new Date(hw.dueAt).getTime() - Date.now();
  if (ms < 0) return 'overdue';
  const days = Math.ceil(ms / 86_400_000);
  return days <= 1 ? 'due today' : `due in ${days} days`;
};
