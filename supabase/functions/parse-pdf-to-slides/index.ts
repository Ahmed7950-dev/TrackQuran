// Supabase Edge Function: parse-pdf-to-slides
// -----------------------------------------------------------------------------
// Takes a public PDF URL and returns a structured array of slides produced by
// Anthropic Claude. The frontend uploads the PDF to Storage, then sends us the
// URL — we fetch & forward to Claude with native PDF document support.
//
// Setup:
//   1. Deploy:   supabase functions deploy parse-pdf-to-slides --no-verify-jwt
//   2. Secrets:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Request body:  { pdfUrl: string, lessonTitle?: string }
// Response:      { slides: Slide[], suggestedTitle?: string }
// -----------------------------------------------------------------------------

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL   = 'claude-sonnet-4-5-20250929';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are an expert Tajweed (Quranic recitation rules) curriculum designer.
You receive a PDF lesson and must convert it into well-structured slides that a tutor will present to students.

CRITICAL OUTPUT RULES — return ONLY valid JSON matching this exact schema:
{
  "suggestedTitle": "string — concise lesson title in English",
  "slides": [
    {
      "id": "slide-1",
      "background": "#ffffff",
      "elements": [
        { "type": "text",  "x": 60, "y": 40,  "w": 1160, "h": 90,  "text": "Title",     "fontSize": 56, "color": "#0f766e", "bold": true,  "align": "center" },
        { "type": "text",  "x": 80, "y": 180, "w": 1120, "h": 400, "text": "Body text", "fontSize": 28, "color": "#1e293b", "bold": false, "align": "right"  },
        { "type": "image", "x": 100, "y": 600, "w": 400, "h": 100, "url": "https://..." }
      ]
    }
  ]
}

Coordinates: every slide is a 1280×720 canvas. Keep margins of ~40px.

Slide design rules:
- First slide: lesson title + 1-line subtitle
- Use one main concept per slide
- Arabic / Quranic text → fontSize 48-64, align "center", color #1e293b
- English explanations → fontSize 24-32, align "right" (RTL Arabic) or "left" (LTR English)
- Headings → fontSize 40+, color #0f766e or #b45309, bold true
- Body → fontSize 24-30
- Use rich color palette: teal (#0f766e), amber (#b45309), green (#16a34a), red (#dc2626), slate (#1e293b)
- 5-12 slides total; do not over-summarise nor over-fragment
- Preserve exact Arabic letters, harakat, and tajweed marks from the source
- If source has images you cannot represent as URL, transcribe them as descriptive text
- Last slide: brief summary or practice prompt

Return ONLY the JSON object — no markdown fences, no commentary.`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { pdfUrl, lessonTitle } = await req.json();
    if (!pdfUrl) return json({ error: 'pdfUrl is required' }, 400);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured on the server' }, 500);

    // Fetch the PDF and base64-encode it for Claude's document content block
    const pdfResp = await fetch(pdfUrl);
    if (!pdfResp.ok) return json({ error: `Failed to fetch PDF: ${pdfResp.status}` }, 400);
    const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());
    const pdfB64 = base64Encode(pdfBytes);

    // Call Claude with the PDF document
    const claudeResp = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfB64 },
            },
            {
              type: 'text',
              text: lessonTitle
                ? `The teacher has named this lesson: "${lessonTitle}". Build the slides accordingly. Output ONLY the JSON.`
                : 'Build the slides. Output ONLY the JSON.',
            },
          ],
        }],
      }),
    });

    if (!claudeResp.ok) {
      const err = await claudeResp.text();
      return json({ error: `Claude API error: ${err}` }, 500);
    }

    const claudeData = await claudeResp.json();
    const text = claudeData.content?.[0]?.text ?? '';

    // Strip any markdown fences if model wrapped JSON
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    let parsed: { slides: unknown[]; suggestedTitle?: string };
    try { parsed = JSON.parse(cleaned); }
    catch { return json({ error: 'Claude returned non-JSON', raw: text }, 500); }

    return json(parsed, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
