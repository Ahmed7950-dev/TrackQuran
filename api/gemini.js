/**
 * Vercel Serverless Function — Gemini AI proxy
 * POST /api/gemini
 *
 * Keeps GEMINI_API_KEY server-side so it is never exposed in the browser bundle.
 * Body: { prompt: string }
 * Response: { text: string } | { error: string }
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured on server.' });
  }

  const { prompt } = req.body ?? {};
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing prompt in request body.' });
  }

  try {
    // gemini-2.0-flash was retired (404). The "latest" alias follows Google's
    // current Flash model; 2.5 is the fallback if the alias is ever missing.
    let response = null;
    for (const model of ['gemini-flash-latest', 'gemini-2.5-flash']) {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        },
      );
      if (![404, 429, 500, 503].includes(response.status)) break;   // gone or busy: try the next model
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return res.status(response.status).json({ error: 'Gemini API returned an error.' });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return res.status(200).json({ text });
  } catch (err) {
    console.error('Gemini proxy error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
