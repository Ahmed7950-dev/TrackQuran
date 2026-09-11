// services/familyGroupService.ts
// -----------------------------------------------------------------------------
// Who is in a family with whom, by student id.
//
// family_links.members store a share link per member (a Quran report id, an
// Arabic share token) rather than the student id, so they can't answer "which
// students are siblings?" directly. The lesson sessions can: grouping students
// on a calendar event stamps family_link_id + family_name onto every session in
// the group, and the student id is right there. One table, one query, and it
// spans both subjects because Quran and Arabic sessions share it.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { pageAll } from './lessonSessionService';

export interface FamilyGroup {
  familyLinkId: string;
  familyName: string;
  /** Every student in the family — Quran and Arabic ids together. */
  memberIds: string[];
}

interface Row { student_id: string | null; family_link_id: string | null; family_name: string | null }

/**
 * studentId → the family they belong to. A student with no family is absent
 * from the map; every member of a family maps to the SAME group object, so
 * `group.memberIds` always includes the student you looked up.
 */
export async function getFamilyGroupsByStudent(
  teacherId: string,
): Promise<Map<string, FamilyGroup>> {
  const out = new Map<string, FamilyGroup>();
  if (!teacherId) return out;
  const rows = await pageAll<Row>((from, to) => supabase
    .from('arabic_lesson_sessions')
    .select('student_id, family_link_id, family_name')
    .eq('teacher_id', teacherId)
    .not('family_link_id', 'is', null)
    .range(from, to));

  const byFamily = new Map<string, { name: string; ids: Set<string> }>();
  for (const r of rows) {
    if (!r.family_link_id || !r.student_id) continue;
    const entry = byFamily.get(r.family_link_id) ?? { name: r.family_name ?? 'Family', ids: new Set<string>() };
    if (r.family_name) entry.name = r.family_name;
    entry.ids.add(r.student_id);
    byFamily.set(r.family_link_id, entry);
  }

  for (const [familyLinkId, { name, ids }] of byFamily) {
    // A "family" of one is just a student — nothing to propagate or pin.
    if (ids.size < 2) continue;
    const group: FamilyGroup = { familyLinkId, familyName: name, memberIds: [...ids] };
    for (const id of ids) out.set(id, group);
  }
  return out;
}

/** The other members of this student's family (never includes them). */
export const familySiblingIds = (
  groups: Map<string, FamilyGroup>, studentId: string,
): string[] => (groups.get(studentId)?.memberIds ?? []).filter(id => id !== studentId);

/**
 * The siblings whose renewal date should follow this student's, already
 * updated. Pure, so the rule is testable on its own: only PREPLY members are
 * touched (a platform student has no subscription), only when the date really
 * differs, and never the student who was edited.
 */
export function familyRenewalUpdates<T extends {
  id: string; studentType?: string; subscriptionRenewalDate?: string;
}>(
  groups: Map<string, FamilyGroup>,
  studentId: string,
  renewalDate: string | undefined,
  roster: T[],
): T[] {
  const siblings = new Set(familySiblingIds(groups, studentId));
  if (siblings.size === 0) return [];
  return roster
    .filter(s => siblings.has(s.id)
      && s.studentType === 'preply'
      && s.subscriptionRenewalDate !== renewalDate)
    .map(s => ({ ...s, subscriptionRenewalDate: renewalDate }));
}
