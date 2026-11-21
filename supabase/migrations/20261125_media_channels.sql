-- Media tab: YouTube channels the tutor watches for new videos.
--
-- Opening Media checks each channel that is not muted (at most every half
-- hour) and, when one has posted something the tutor has not been offered
-- yet, asks whether to put it on the shelf. Reading a channel goes through
-- /api/youtube-channel and /api/youtube-playlist (no API key; YouTube has no
-- CORS, so the server reads the pages).
--
-- Like the rest of the Media tables: the tutor's own rows only, no anon path.

create table if not exists public.media_channels (
  id             uuid primary key default gen_random_uuid(),
  teacher_id     uuid not null references auth.users(id) on delete cascade,
  -- The UC… id. Handles change; this does not.
  channel_id     text not null,
  handle         text,
  title          text not null,
  thumb_url      text,
  -- The channel's uploads as a playlist: UULF… (long videos, no Shorts), or
  -- UU… for a channel that only has Shorts.
  uploads_id     text not null,
  -- Where its videos went last time; the pop-up starts there.
  category_id    uuid references public.media_categories(id) on delete set null,
  -- Muted: still listed, never checked, never asks.
  muted          boolean not null default false,
  -- What the uploads list held at the last check, newest first:
  -- [{ "id", "title", "length", "age" }].
  latest_videos  jsonb,
  -- Every video the tutor has been offered (added or skipped). New = in
  -- latest_videos and not in here. Filled with the whole list on the day the
  -- channel is added, so its back catalogue is never announced.
  seen_video_ids text[] not null default '{}',
  checked_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (teacher_id, channel_id)
);

create index if not exists media_channels_teacher on public.media_channels (teacher_id, created_at);

alter table public.media_channels enable row level security;

drop policy if exists media_channels_own on public.media_channels;
create policy media_channels_own on public.media_channels
  for all using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
