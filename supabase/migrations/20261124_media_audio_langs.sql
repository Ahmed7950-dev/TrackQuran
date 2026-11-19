-- Media shelf: the languages a reel can be heard in.
--
-- YouTube's audio tracks for the video (multi-language audio: "Arabic
-- original", "English"…), or with none listed, the language its automatic
-- captions heard. Base codes only: {ar,en}. A playlist holds the union of its
-- first few videos. NULL = not known yet.
--
-- Filled by scripts/media-audio-langs.py (run from a home connection: the
-- browser cannot read YouTube, Vercel gets a bot check) and by the tutor's
-- English toggle on each reel. Read by the Media tab's English filter.
--
-- media_items keeps its auth.uid() policies; a new column needs nothing more.

alter table public.media_items add column if not exists audio_langs text[];
