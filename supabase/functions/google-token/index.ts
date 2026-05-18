/**
 * Supabase Edge Function: google-token
 *
 * Handles two operations for Google OAuth2:
 *   action = "exchange"  — exchange a GIS authorization code for access + refresh tokens
 *   action = "refresh"   — use a stored refresh token to get a new access token
 *
 * The Google client_secret lives here (server-side), never in the browser.
 *
 * Required Supabase secrets (set via CLI):
 *   supabase secrets set GOOGLE_CLIENT_ID=<your-client-id>
 *   supabase secrets set GOOGLE_CLIENT_SECRET=<your-client-secret>
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json() as {
      action: 'exchange' | 'refresh';
      code?: string;
      refreshToken?: string;
    };

    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: 'server_misconfiguration', error_description: 'Google credentials not configured in Supabase secrets.' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    let params: Record<string, string>;

    if (body.action === 'exchange' && body.code) {
      // Exchange authorization code → access_token + refresh_token
      params = {
        code:          body.code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  'postmessage',   // Required for GIS popup / code flow
        grant_type:    'authorization_code',
      };
    } else if (body.action === 'refresh' && body.refreshToken) {
      // Use refresh token → new access_token
      params = {
        refresh_token: body.refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'refresh_token',
      };
    } else {
      return new Response(
        JSON.stringify({ error: 'invalid_request', error_description: 'Provide action=exchange+code or action=refresh+refreshToken.' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const googleRes = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(params),
    });

    const data = await googleRes.json();

    return new Response(JSON.stringify(data), {
      status:  googleRes.status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'internal_error', error_description: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
