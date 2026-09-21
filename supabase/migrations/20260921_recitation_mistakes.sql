-- A reassigned recitation homework carries the mistakes the tutor logged on its
-- verses, so the student sees them highlighted, with comments, while re-recording.
alter table quran_recitation_homework add column if not exists mistakes jsonb;
