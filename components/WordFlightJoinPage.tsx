import React from 'react';
import WordFlightGame from './WordFlightGame';

const WordFlightJoinPage: React.FC<{ roomId: string }> = ({ roomId }) => (
  <WordFlightGame
    words={[]}
    roomId={roomId}
    playerRole="2"
    onExit={() => { window.location.href = '/'; }}
  />
);

export default WordFlightJoinPage;
