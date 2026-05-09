# Tajweed Lessons — One-Time Setup

Follow these steps in order. Do them once.

## 1. Run the SQL migration
1. Open Supabase Dashboard → **SQL Editor**.
2. Paste the contents of `supabase/tajweed_migration.sql` and click **Run**.
3. This creates: `tajweed_lessons`, `tajweed_lesson_completions`, RLS policies, an `is_admin()` helper, and an RPC.

## 2. Create the storage bucket
1. Supabase Dashboard → **Storage** → **New bucket**.
2. Name: `tajweed-assets`
3. **Public**: ON
4. Create.

## 3. Promote yourself (or another user) to admin
Find your user UUID in **Authentication → Users**, then run in SQL Editor:

```sql
update public.profiles set role = 'admin' where id = '<your-user-uuid>';
```

Reload the app — the **Tajweed** tab will now show "Create Lesson from PDF" for you.

## 4. Deploy the Edge Function (calls Claude)
You need the [Supabase CLI](https://supabase.com/docs/guides/cli) installed and linked to your project.

```bash
# Set your Anthropic API key as a secret (only stored on Supabase, never in client)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Deploy the function
supabase functions deploy parse-pdf-to-slides --no-verify-jwt
```

> Get an Anthropic API key at https://console.anthropic.com/

## Done!
You can now go to the **Tajweed** tab and:
- Click **Create Lesson from PDF**
- Upload a PDF
- Wait ~30s while Claude reads it and builds slides
- Edit slides freely (drag, resize, change text/colors/fonts, add images)
- Save

Tutors will see all lessons. They pick a student from the dropdown and click **Mark Done** to record completion. Completed lessons appear automatically on the student's detail page **and** their shared report link.
