-- 20260629_tutor_lottie_icons.sql
-- Per-tutor library of custom animated avatars (pasted Lottie JSON). The JSON
-- itself is stored as a public file in the `tajweed-assets` bucket; this table
-- indexes them so a tutor can list and reuse their icons across students.

create table if not exists public.tutor_lottie_icons (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null default auth.uid(),
  name          text not null,
  url           text not null,
  storage_path  text,
  created_at    timestamptz not null default now()
);

alter table public.tutor_lottie_icons enable row level security;

drop policy if exists "tutor_lottie_icons_select" on public.tutor_lottie_icons;
create policy "tutor_lottie_icons_select" on public.tutor_lottie_icons
  for select using (auth.uid() = teacher_id);

drop policy if exists "tutor_lottie_icons_insert" on public.tutor_lottie_icons;
create policy "tutor_lottie_icons_insert" on public.tutor_lottie_icons
  for insert with check (auth.uid() = teacher_id);

drop policy if exists "tutor_lottie_icons_delete" on public.tutor_lottie_icons;
create policy "tutor_lottie_icons_delete" on public.tutor_lottie_icons
  for delete using (auth.uid() = teacher_id);
