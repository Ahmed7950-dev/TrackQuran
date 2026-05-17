/**
 * Teacher availability service — stores weekly working-hour slots in Supabase.
 *
 * Required SQL (run once in Supabase SQL editor):
 * ──────────────────────────────────────────────
 * create table if not exists teacher_settings (
 *   teacher_id uuid primary key references auth.users(id) on delete cascade,
 *   availability jsonb not null default '[]',
 *   updated_at   timestamptz not null default now()
 * );
 * alter table teacher_settings enable row level security;
 * create policy "teachers_own_settings" on teacher_settings
 *   using (auth.uid() = teacher_id) with check (auth.uid() = teacher_id);
 * create policy "public_read_teacher_settings" on teacher_settings
 *   for select using (true);
 */

import { supabase } from '../lib/supabase';

export interface AvailabilitySlot {
  dayOfWeek: number; // 0 = Mon … 6 = Sun
  hour:      number; // 0-23 in Istanbul time (tutor's timezone)
}

export async function getTeacherAvailability(teacherId: string): Promise<AvailabilitySlot[]> {
  const { data, error } = await supabase
    .from('teacher_settings')
    .select('availability')
    .eq('teacher_id', teacherId)
    .single();
  if (error) return [];
  return (data?.availability as AvailabilitySlot[]) ?? [];
}

export async function saveTeacherAvailability(
  teacherId: string,
  slots: AvailabilitySlot[],
): Promise<void> {
  await supabase
    .from('teacher_settings')
    .upsert(
      { teacher_id: teacherId, availability: slots, updated_at: new Date().toISOString() },
      { onConflict: 'teacher_id' },
    );
}
