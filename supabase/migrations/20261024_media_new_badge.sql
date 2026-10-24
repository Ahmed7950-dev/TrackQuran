-- ─── "new" on the Media tab ─────────────────────────────────────────────────
-- A tutor keeps adding videos to their own YouTube playlists, and nothing in
-- the app said so: the shelf looked the same whether a list had gained three
-- videos overnight or none.
--
-- Two lists of ids per playlist rather than a count, because a count misses the
-- case that matters most — one video added and one removed leaves the count
-- where it was, and the new one would never be flagged.
--
--   latest_video_ids  what YouTube answered at checked_at
--   seen_video_ids    what the tutor has already been shown
--   new = latest - seen
--
-- seen is filled on the FIRST check, so a playlist that has been on the shelf
-- for months does not suddenly arrive with 42 "new" videos.

alter table public.media_items
  add column if not exists latest_video_ids text[],
  add column if not exists seen_video_ids   text[],
  add column if not exists checked_at       timestamptz;

comment on column public.media_items.latest_video_ids is
  'Video ids the playlist held when it was last read from YouTube.';
comment on column public.media_items.seen_video_ids is
  'Video ids the tutor has already been shown. Null until the first check.';
comment on column public.media_items.checked_at is
  'When YouTube was last asked about this playlist; the client throttles on it.';
