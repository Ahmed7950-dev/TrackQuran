-- The Media tab: a tutor's shelf of YouTube videos and playlists to watch with
-- a student, and one watch mark per student per reel.
--
-- The shelf belongs to the TUTOR, not to a student: a link added while Yusuf's
-- page is open is on the shelf when Maryam's page is open too. The marks are
-- the other way round — each student has their own place in each reel.
--
-- This tab exists only in the tutor app; nothing on a student's share link
-- reads any of it. So unlike the older tables, these are written tight from
-- the start: every policy is the owning tutor, and there is no anon path.

-- ── Categories ──────────────────────────────────────────────────────────
create table if not exists public.media_categories (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  -- The dot beside the name in the rail. Null = the tab picks one.
  hue        text,
  created_at timestamptz not null default now()
);

create index if not exists media_categories_teacher on public.media_categories (teacher_id);

-- ── The shelf ───────────────────────────────────────────────────────────
create table if not exists public.media_items (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.media_categories(id) on delete set null,
  -- The tutor's own words. This is what the search box looks through: YouTube
  -- titles are not fetched, because that would need an API key.
  title       text not null,
  kind        text not null check (kind in ('video', 'playlist')),
  -- A video id, or a playlist id — which one is decided by `kind`.
  youtube_id  text not null,
  url         text not null,
  -- How many videos the playlist holds. Not known until the player has loaded
  -- it once, so it is filled in on the first watch rather than on adding.
  item_count  int,
  created_at  timestamptz not null default now(),
  unique (teacher_id, kind, youtube_id)
);

create index if not exists media_items_teacher on public.media_items (teacher_id, created_at desc);

-- ── One student's place in one reel ─────────────────────────────────────
create table if not exists public.media_progress (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null references public.media_items(id) on delete cascade,
  -- No foreign key: a reel can be watched with a Quran student (students.id,
  -- text) or an Arabic one (arabic_students.id), which are two tables.
  student_id       text not null,
  -- Seconds into the video that is open now.
  position_seconds numeric not null default 0,
  duration_seconds numeric,
  -- Which video of a playlist is open; 0 for a single video.
  playlist_index   int not null default 0,
  -- Which videos of a playlist have been watched through.
  watched_indexes  int[] not null default '{}',
  finished         boolean not null default false,
  updated_at       timestamptz not null default now(),
  unique (item_id, student_id)
);

create index if not exists media_progress_student on public.media_progress (student_id);

-- ── Row level security ──────────────────────────────────────────────────
alter table public.media_categories enable row level security;
alter table public.media_items      enable row level security;
alter table public.media_progress   enable row level security;

drop policy if exists media_categories_own on public.media_categories;
create policy media_categories_own on public.media_categories
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

drop policy if exists media_items_own on public.media_items;
create policy media_items_own on public.media_items
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- A mark is reachable only through the reel it belongs to, and only by the
-- tutor who owns that reel.
drop policy if exists media_progress_own on public.media_progress;
create policy media_progress_own on public.media_progress
  for all
  using (exists (
    select 1 from public.media_items i
     where i.id = media_progress.item_id and i.teacher_id = auth.uid()))
  with check (exists (
    select 1 from public.media_items i
     where i.id = media_progress.item_id and i.teacher_id = auth.uid()));
