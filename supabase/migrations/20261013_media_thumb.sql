-- A playlist has no still of its own, so the shelf drew a blank box for it.
-- YouTube's oEmbed endpoint hands out the first video's thumbnail for a
-- playlist URL, with no API key and with CORS open, so it is fetched once and
-- kept here rather than on every render.
alter table public.media_items add column if not exists thumb_url text;
