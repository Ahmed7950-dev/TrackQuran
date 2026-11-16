/**
 * Vercel Serverless Function — speaking questions for Free Talk
 * POST /api/talk-questions
 *
 * The Free Talk tab sends the student's own verbs (with the forms they wrote)
 * and the words they have learned; Gemini writes questions a tutor would ask
 * to make the student answer out loud with them. The prompt is built here,
 * not in the browser, so this endpoint only ever writes speaking questions.
 *
 * Body: {
 *   variety: 'levantine' | 'msa', script: 'arabic' | 'translit',
 *   focus: 'mixed' | 'past' | 'present',
 *   verbs: [{ meaning: 'to write', forms: { past: { 'I': 'katabt', ... }, ... } }],
 *   words: [{ w: 'kitab', en: 'book' }]
 * }
 * Response: { questions: [{ q, en, hint, uses: [] }] } | { error }
 */

const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'];
const MAX_VERBS = 30;
const MAX_WORDS = 80;
const clip = (s, n) => String(s ?? '').slice(0, n);
const AR = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]{2,}/;
/** Persian/Urdu letters the model sometimes slips in, as Arabic ones. */
const fixLetters = s => String(s ?? '').replace(/\u06CC/g, '\u064A').replace(/\u06A9/g, '\u0643').replace(/\u06C1/g, '\u0647');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'The question writer is not set up on the server.' });

  const body = req.body ?? {};
  const variety = body.variety === 'msa' ? 'msa' : 'levantine';
  const script = body.script === 'translit' ? 'translit' : 'arabic';
  const focus = ['past', 'present'].includes(body.focus) ? body.focus : 'mixed';
  const verbs = (Array.isArray(body.verbs) ? body.verbs : []).slice(0, MAX_VERBS).map(v => ({
    meaning: clip(v?.meaning, 60),
    forms: Object.fromEntries(['past', 'present', 'imperative'].map(t => [t,
      Object.fromEntries(Object.entries(v?.forms?.[t] ?? {}).slice(0, 13).map(([k, f]) => [clip(k, 20), clip(f, 40)]))])),
  })).filter(v => v.meaning);
  const words = (Array.isArray(body.words) ? body.words : []).slice(0, MAX_WORDS)
    .map(w => ({ w: clip(w?.w, 40), en: clip(w?.en, 60) })).filter(w => w.w);
  if (!verbs.length && !words.length) return res.status(400).json({ error: 'Add a few verbs or words first.' });

  const lang = variety === 'msa'
    ? 'Modern Standard Arabic (fusha)'
    : 'Palestinian colloquial Arabic (spoken Levantine, NOT fusha). Use everyday Palestinian words like shu, wen, emta, kif, ma3 min, lesh, mbareh, bukra, kul yom';
  const writing = script === 'arabic'
    ? 'Write the questions and hints in Arabic script ONLY: no Latin letters at all, not even for one word, and only Arabic letters (ي not ی, ك not ک).' + (variety === 'msa' ? ' Add the vowel marks needed to read the verb forms.' : ' Spell the way the student\'s own forms are spelled.')
    : 'Write the questions and hints in Latin transliteration ONLY (no Arabic script), copying the spelling style of the student\'s forms exactly (same letters for ḥ, 3, kh, gh, long vowels).';
  const focusLine = focus === 'past'
    ? 'Every question asks about the past, so the answer uses a past form.'
    : focus === 'present'
      ? 'Every question asks about now, habits or plans, so the answer uses a present form.'
      : 'Mix past and present questions.';

  const prompt = `You are an Arabic tutor in a one-to-one speaking lesson. Write 8 short questions to ask your student, in ${lang}.
The point is to make the student SPEAK: each question must need an answer that uses one of the student's verbs (in the "I" form, or "we") and, where it fits naturally, one or two of the student's words.

Rules:
- Use ONLY verbs from the list below, and build each question with the student's own "you" forms where given (copy them exactly). Do not use other verbs in the question if you can avoid it.
- The question talks TO the student, so its verb is a "you" form (or a question about he/she/they). Never put the "I" form in the question: the "I" form belongs in the hint, the answer.
- Prefer the student's words for the nouns. Do not bring in rare words they do not know.
- Questions must make sense in real life (no "did you eat the pen"). Ask about their day, family, home, work, school, food, plans, likes.
- Questions are short: 3 to 9 words. Address the student as a male "you" unless the forms only give the female one.
- Use each verb at most twice. Cover as many different verbs as you can.
- ${focusLine}
- ${writing}
- "hint" is how the answer could start, 2 to 5 words, using the student's "I" form of the verb.
- "en" is a plain English translation of the question.
- "uses" lists the verbs (their English meaning, like "to write") and words (as written below) the question is built on.

The student's verbs, with the forms they wrote (key = pronoun):
${JSON.stringify(verbs)}

The student's words (w = as written, en = meaning):
${JSON.stringify(words)}

Reply with JSON only, in this shape:
{"questions":[{"q":"...","en":"...","hint":"...","uses":["to write","kitab"]}]}`;

  try {
    // Google often answers 503 "busy" for a few seconds at a time: go round
    // the models up to three times, waiting a little longer each round.
    let response = null;
    const tried = [];
    const started = Date.now();
    rounds: for (let round = 0; round < 3; round++) {
     if (round > 0) await new Promise(r => setTimeout(r, round * 2500));
     for (const model of MODELS) {
      if (Date.now() - started > 45000) break rounds;
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 1 },
        }),
      });
      if (![404, 429, 500, 503].includes(response.status)) break rounds;   // answered (or a real error)
      const why = await response.clone().json().catch(() => ({}));
      tried.push(`${model} ${response.status} ${String(why?.error?.status ?? '')} ${String(why?.error?.message ?? '').slice(0, 140)}`);
     }
    }
    if (!response.ok) {
      console.error('talk-questions Gemini error:', response.status, await response.text());
      return res.status(502).json({ error: `The question writer did not answer (${response.status}). Try again in a minute.`, tried });
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    let parsed;
    try {
      const raw = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      const from = Math.min(...['{', '['].map(c => raw.indexOf(c)).filter(i => i >= 0));
      parsed = JSON.parse(Number.isFinite(from) ? raw.slice(from) : raw);
    } catch { parsed = null; }
    // The model is asked for {"questions":[…]} but sometimes sends the bare
    // list or another key, so take the first list found.
    const list = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.questions) ? parsed.questions
      : Object.values(parsed ?? {}).find(Array.isArray) ?? [];
    const questions = list
      .map(q => ({
        q: clip(q?.q ?? q?.question, 200).trim(), en: clip(q?.en ?? q?.english, 200).trim(), hint: clip(q?.hint, 120).trim(),
        uses: (Array.isArray(q?.uses) ? q.uses : []).slice(0, 4).map(u => clip(u, 40)),
      }))
      .map(q => ({ ...q, q: fixLetters(q.q), hint: fixLetters(q.hint), uses: q.uses.map(fixLetters) }))
      // the student reads one script: drop a question written in the other one
      .filter(q => q.q && (script === 'arabic' ? AR.test(q.q) && !LATIN.test(q.q) : !AR.test(q.q)));
    if (!questions.length) {
      const why = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? 'empty';
      console.error('talk-questions unreadable reply:', why, text.slice(0, 500));
      return res.status(502).json({ error: `No questions came back (${why}). Try again.`, debug: text.slice(0, 300) });
    }
    return res.status(200).json({ questions });
  } catch (err) {
    console.error('talk-questions error:', err);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  }
}
