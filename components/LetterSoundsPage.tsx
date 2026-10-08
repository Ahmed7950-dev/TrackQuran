// components/LetterSoundsPage.tsx
// ---------------------------------------------------------------------------
// The /letter-sounds/<id> link: a student listening on their own, with no
// session. Loads the challenge, hands it to the full-screen player, and lets
// the player mark it opened and tell the tutor when it is done.
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react';
import LetterSoundsChallenge from './LetterSoundsChallenge';
import { getLetterSounds, type LetterSoundChallenge } from '../services/letterSoundsService';

const LetterSoundsPage: React.FC<{ id: string }> = ({ id }) => {
  const [challenge, setChallenge] = useState<LetterSoundChallenge | null | undefined>(undefined);

  useEffect(() => {
    document.title = 'Listen to the letters';
    void getLetterSounds(id).then(setChallenge);
  }, [id]);

  const shell = (inner: React.ReactNode) => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0E201C', color: '#F4EFE2', fontFamily: "'Nunito', system-ui, sans-serif", padding: 24, textAlign: 'center' }}>
      {inner}
    </div>
  );

  if (challenge === undefined) return shell(<p style={{ color: '#9DB3AB' }}>Loading…</p>);
  if (!challenge) return shell(
    <div>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>This link is no longer available</p>
      <p style={{ margin: '8px 0 0', color: '#9DB3AB' }}>Ask your teacher for a new one.</p>
    </div>,
  );

  return (
    <LetterSoundsChallenge
      vowel={challenge.vowel}
      form={challenge.form}
      topicTitle={challenge.topicTitle}
      challenge={challenge}
      onExit={() => { window.location.href = '/'; }}
    />
  );
};

export default LetterSoundsPage;
