import React from 'react';
import CraneBuilderGame from './CraneBuilderGame';

// Student-facing page for a tutor's "play live" link (/crane/<uuid>). No auth:
// the word list arrives over the realtime channel from the tutor (spectator).
const CraneBuilderJoinPage: React.FC<{ roomId: string }> = ({ roomId }) => (
  <CraneBuilderGame
    words={[]}
    roomId={roomId}
    role="player"
    onExit={() => { window.location.href = '/'; }}
  />
);

export default CraneBuilderJoinPage;
