# Lisan & Quran (TrackQuran)

A tutoring platform for Quran and Arabic lessons — live at [lisanquran.com](https://www.lisanquran.com).

## What's inside

- **Tutor workspace** — student roster, live Quran recitation logging with per-letter
  mistake marking and a full tajweed color engine, progress statistics, attendance,
  billing/invoices, and a lesson calendar with Google Meet integration.
- **Student portals** — shareable `/report/:id` links and the unified `/portal/:id`,
  plus Google sign-in self-registration (`/join`) with a logged-in portal (`/student`).
- **Arabic lessons** — lesson calendar, homework/exam builder, vocabulary and grammar
  authoring, and lesson-progress tracking with PDF slides.
- **Learning games** — Letter Flight, Word Flight, Letter Race, Flappy Letters
  (online 2-player over WebRTC P2P + Supabase fallback), Tower Defense,
  and Crane Builder (live tutor↔student sessions).

## Stack

React 19 + TypeScript + Vite · Tailwind (build-time via PostCSS) · Supabase
(Postgres, Auth, Realtime, Storage) · Vercel (hosting + `api/gemini.js`
serverless Gemini proxy) · lottie-web · pdfjs-dist.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build into dist/
```

Environment: Supabase keys live in `lib/supabase.ts`; `GEMINI_API_KEY` is a
Vercel serverless env var (never shipped to the browser).

## Layout

| Path          | Contents                                                       |
| ------------- | -------------------------------------------------------------- |
| `components/` | All pages + games (routing is pathname-based in `App.tsx`)     |
| `services/`   | Supabase data access + domain engines (e.g. tajweed colors)    |
| `supabase/`   | SQL migrations (`migrations/` is the dated, canonical set)     |
| `public/`     | Static assets — `Fonts/` here is the LIVE, hand-patched set    |
| `Fonts/`      | Local-only pre-patch font backups (untracked)                  |
| `api/`        | Vercel serverless functions                                    |
