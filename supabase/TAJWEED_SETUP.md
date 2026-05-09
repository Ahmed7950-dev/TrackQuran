# Tajweed Lessons — Setup (3 steps, ~5 minutes)

No CLI, no API keys, no terminal commands needed.

## 1. Run the SQL migration
1. Open Supabase Dashboard → **SQL Editor** → **New query**
2. Paste the contents of `supabase/tajweed_migration.sql`
3. Click **Run** (✅ Success)

This creates the `tajweed_lessons` and `tajweed_lesson_completions` tables, RLS policies, and helper functions.

## 2. Create the storage bucket
1. Supabase Dashboard → **Storage** → **New bucket**
2. Name: **`tajweed-assets`** (must match exactly)
3. Toggle **Public bucket** ON
4. Click **Create bucket**

This is where slide images are uploaded.

## 3. Make yourself an admin
In **SQL Editor**, run:

```sql
update public.profiles set role = 'admin' where id = '<your-user-uuid>';
```

> Find your user UUID in **Authentication → Users** (or use the one you already know).

Then **log out and back in** so the app picks up your new role.

---

## ✅ Done!

Go to the **Tajweed** tab. As admin you'll see **"Create New Lesson"**.

- Click it → enter a title → opens the editor
- Add text boxes, upload images, change colors, add more slides
- Save
- Tutors can now open the lesson, navigate slide-by-slide, and mark it as done for any of their students
- Completed lessons appear automatically on each student's detail page and shared report link
