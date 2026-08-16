# LisanQuran — Quran Launch Plan

Quran-only launch (Arabic material comes later). Work the phases in order; items inside a
phase can run in parallel. Tick the boxes as you go — GitHub renders them as real checkboxes.

**The logic of the ordering:** the 3-month tutor course is the critical path (nothing launches
before trained tutors exist), and company formation is the longest external wait. So the slow
things start first, and everything else fits inside the 3-month runway the course creates.

---

## ✅ Already done (before this plan)

- [x] Platform core: live logging, tajweed engine, portals, homework, games, billing, calendar
- [x] Student self-registration flow (`/join` Google signup → tutor approval → portal)
- [x] Policy pages ready for Stripe: Terms, Privacy, Refunds, Pricing — Paddle removed,
      direct-seller wording, 12-hour cancellation / 90-day credit-refund policy (16 Aug 2026)
- [x] Database migrations: **34 / 34 applied** (audited against the live DB, 16 Aug 2026)

---

## Phase 0 — Start this week (all "start and wait" — do in parallel)

### 0.1 Company, bank & payment accounts
- [ ] Email lance.uk: UK Ltd formation + registered address + business bank account
- [ ] Ask lance.uk to include: **a tutor contractor-agreement template** and VAT guidance
      for digital education services sold internationally
- [ ] Open Stripe account as soon as the company number exists (site + policies are ready ✅)
- [ ] Open PayPal Business as a secondary payment option
- **Why first:** formation + bank + Stripe review = weeks of waiting. One email today costs nothing.

### 0.2 Visual identity & logo
- [ ] Commission identity (Fiverr Pro / 99designs / a designer you trust)
- [ ] Deliverables to demand: logo (full + icon + white versions), color palette, 2 fonts
      (Latin + Arabic), social templates (post / story / thumbnail), favicon set
- [ ] Apply to the platform: swap `TQ LOGO.png`, favicons, manifest icons, landing page
- **Tip:** the platform already uses teal/emerald — tell the designer to either build on it
  or expect a re-theme task afterwards.

### 0.3 Secure the brand name (10 minutes, before someone else does)
- [ ] Instagram — reserve @handle
- [ ] TikTok — reserve @handle
- [ ] YouTube — reserve channel
- [ ] Facebook — reserve page
- [ ] X / Twitter — reserve @handle (optional but cheap)
- [ ] Confirm the .com / domain variants you want are registered
- **Don't build the pages yet** — just own the names.

---

## Phase 1 — Content & pipeline prep (weeks 1–6, while the company forms)

### 1.1 Write the 3-month tutor training course  ⟵ CRITICAL PATH
- [ ] Syllabus skeleton (suggested 12 weeks):
      - Weeks 1–2: platform mastery (logging, mistakes, homework, reports, calendar, games)
      - Weeks 3–5: Qaedah teaching method (matches the platform's Qaedah lessons)
      - Weeks 6–8: Tajweed rules + how the color engine teaches them
      - Weeks 9–10: teaching children online (engagement, games, parent communication)
      - Weeks 11–12: mock lessons, review, exam prep
- [ ] Write weekly lesson notes / slides
- [ ] Write the final exams (theory + a practical mock-lesson assessment)
- [ ] Define the selection rubric for choosing the 10 tutors (so rejections are defensible)
- **Every day this isn't finished pushes launch day back a day.**

### 1.2 Qaedah + Tajweed student material  (dual-use: tutors train on it, students learn from it)
- [ ] Complete the Qaedah lesson set (platform already has lessons + EN/AR explanations — fill gaps)
- [ ] Record word/letter audio where missing (Quran Lab studio + word-audio pipeline exist ✅)
- [ ] Write the Tajweed lesson series (the 17-rule color engine is the teaching aid ✅)
- [ ] Upload everything and click through as a student

### 1.3 Course registration pages (replaces Google Forms)
- [ ] Public course page: what it is, 12-week outline, schedule, selection process
- [ ] Application form: name, email, phone/WhatsApp, qualifications (ijazah/tajweed level),
      experience, availability, short motivation text
- [ ] Tutor-side admin list to review / shortlist / reject applicants
- **Best solution:** reuse the `/join` wizard pattern + a small `course_applications` table
  (one migration). I can build this — say the word.

### 1.4 Registration forms — test student, build tutor
- [ ] **Test** the existing student `/join` flow with a **brand-new Google account**
      (this also verifies the one RLS policy the DB audit couldn't probe)
- [ ] Test the approval → portal path end to end on a phone
- [ ] Build the tutor registration form (reuse the student wizard; role = tutor, pending approval)
- [ ] Test tutor signup → your approval → tutor dashboard access

### 1.5 Stripe integration  ⚠️ MISSING FROM ORIGINAL LIST — the biggest build item
- [ ] Decide the model — **recommended: lesson credits** (matches the new refund policy:
      $15/credit, 12-hour cancellation returns the credit, 90-day refund window)
- [ ] `credits` table + ledger (purchases, deductions per lesson, cancellations, refunds)
- [ ] Stripe Checkout for buying credit packs (1 / 4 / 8 / 12 lessons)
- [ ] Supabase Edge Function webhook: `checkout.session.completed` → add credits
- [ ] Show credit balance in the student portal; deduct on logged lesson
- [ ] Align Terms §4–§5 wording to the credits model (currently says "monthly plans")
- **Blocked by** Stripe account (0.1), but the code can be built and tested in Stripe
  test mode **now** — don't wait.

### 1.6 Free-trial booking flow  ⚠️ MISSING — the pricing page promises it
- [ ] "Book a free trial" → small form (name, child's age, timezone, preferred times, WhatsApp)
- [ ] Lands in a tutor-side list; you confirm a slot and send the portal link
- **Best solution:** manual confirmation at first (you have `tutor_busy_slots` already);
  automate scheduling only when volume demands it.

### 1.7 Production hardening  ⚠️ MISSING
- [ ] Custom domain live on the production deployment (HTTPS)
- [ ] `support@lisanquran.com` actually receives mail (Google Workspace, ~$7/mo)
      — the policies promise 2-business-day replies
- [ ] Supabase **Pro tier** (free-tier Realtime quota already bit once in July)
- [ ] Enable Supabase daily backups / PITR
- [ ] Error tracking (Sentry free tier) so student-side crashes reach you
- [ ] Uptime monitor on the landing page + portal (UptimeRobot free)

### 1.8 Tutor contracts & payouts  ⚠️ MISSING
- [ ] Contractor agreement (template from lance.uk — task 0.1)
- [ ] Decide the split (e.g. tutor keeps $X of each $15 lesson) — put it in the contract
- [ ] Payout rail — **best solution to start: Wise Business** monthly batch transfers
      (cheap, works worldwide); move to Stripe Connect later if you scale
- [ ] Simple payout sheet per tutor from the platform's earnings data

### 1.9 Child safety & tutor vetting  ⚠️ MISSING
- [ ] Write a short Child Safety policy page (add to the legal footer)
- [ ] Vetting for the 10 tutors: ID check, 2 references, qualification proof — file per tutor
- [ ] Rules in the tutor contract: no private off-platform contact with minors,
      parent may sit in, complaints go to support@
- **Why:** parents, ad platforms and app stores all ask; being able to answer builds trust.

---

## Phase 2 — The 3-month runway (course running = audience building)

### 2.1 Launch social pages (with the new identity)
- [ ] Complete profiles on Instagram, TikTok, YouTube, Facebook (bio, link, branding)
- [ ] Link them from the landing page footer

### 2.2 Run the tutor course
- [ ] Announce + open registration (pages from 1.3)
- [ ] Interview/shortlist applicants; aim to start with 15–20 so 10 survive selection
- [ ] Start the daily 1-hour meetings (Google Meet — the platform's Meet-now flow works ✅)
- [ ] Weekly mini-quizzes so the final selection has data, not just impressions

### 2.3 Shoot advertising videos
- [ ] Script 3 core videos: (1) parent-facing "what your child gets", (2) platform demo,
      (3) teacher story / trust piece
- [ ] Capture real screen recordings of the platform (games, tajweed colors, progress reports
      — the gameplay-clip pipeline exists ✅)
- [ ] Cut vertical (Reels/TikTok) and horizontal (YouTube) versions

### 2.4 Organic publishing (the whole 3 months)
- [ ] Content calendar — 3 pillars: tajweed tips, platform features, course behind-the-scenes
- [ ] 3–4 posts/week minimum; batch-record weekly
- [ ] Collect emails/WhatsApp of interested parents into a launch waitlist
- **The point:** by launch day you have a warm audience you didn't pay for.

### 2.5 Soft launch (beta)  ⚠️ MISSING — do this before any paid traffic
- [ ] Weeks 10–12 of the course: your existing students + course tutors run real lessons
- [ ] Real payments in Stripe **live** mode with 2–3 friendly families
- [ ] Fix what breaks; only then open the doors

---

## Phase 3 — Launch (month 4)

### 3.1 Select the tutors
- [ ] Final exams + practical assessments
- [ ] Choose the 10, sign contracts, set their availability in the platform
- [ ] Politely close the loop with those not selected (keep a bench for growth)

### 3.2 Analytics + consent  ⚠️ MISSING — pairs with ads, do together
- [ ] Add analytics (Plausible = no consent banner needed, or GA4 + Meta Pixel = banner required)
- [ ] If using ad pixels: add the cookie-consent banner (EU/UK), reject = as easy as accept
- [ ] Define conversions: trial request, signup, first purchase

### 3.3 Paid ads — deliberately LAST
- [ ] Start with **one** platform (Meta: Facebook+Instagram) and one audience
      (e.g. parents, 1–2 countries you know)
- [ ] Small daily budget, optimize for trial requests, kill what doesn't convert weekly
- [ ] Only scale spend when: payments work, tutors have free slots, support keeps up

---

## Deferred (deliberately NOT in the launch)

- **Mobile app** — the web app is responsive and portals work on phones. After launch,
  ship a thin **PWA/TWA wrapper** (manifest + icons already exist) for a Play Store
  presence at ~5% of the cost of a real app; revisit native only if usage demands it.
- **Full Arabic material** — per your decision; the Arabic side of the platform stays
  built and waiting.

---

## Quick dependency map

```
0.1 company ──────────► Stripe live ─────► 2.5 soft launch ─► 3.3 paid ads
0.2 identity ─► 2.1 social ─► 2.3 videos ─► 2.4 organic ────► 3.3
1.1 course ──► 1.3 reg pages ─► 2.2 run course ─► 3.1 pick 10 ─► 3.3
1.2 material ─► feeds 1.1 and students
1.5 stripe code (test mode now) ─► goes live when 0.1 finishes
```
