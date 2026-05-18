// components/GCalOAuthCallback.tsx
// ---------------------------------------------------------------------------
// Tiny page that handles the Google OAuth2 redirect at /gcal-callback.
// Google redirects here with ?code=... after the user grants permission.
// This page immediately posts the code to the parent window and closes.
// ---------------------------------------------------------------------------

import React, { useEffect } from 'react';

const GCalOAuthCallback: React.FC = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code   = params.get('code');
    const error  = params.get('error');

    if (window.opener) {
      if (code)  window.opener.postMessage({ gcalCode: code },  window.location.origin);
      if (error) window.opener.postMessage({ gcalError: error }, window.location.origin);
    }

    // Close the popup — the parent window handles the rest
    window.close();
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', fontFamily: 'sans-serif', color: '#555',
    }}>
      <p>Connecting Google Calendar…</p>
    </div>
  );
};

export default GCalOAuthCallback;
