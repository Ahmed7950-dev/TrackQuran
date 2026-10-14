// components/HunterBoardPage.tsx
// -----------------------------------------------------------------------------
// What a phone or tablet gets when it scans the board's code (/board/<id>).
//
// No sign-in and no row in the database: the board is a room on the realtime
// channel that lives as long as the lesson screen holds it open. Whoever scans
// draws as the STUDENT unless the link says `?me=tutor` — the tutor's own code,
// so his ink lands on his layer and his eraser can clear both.
// -----------------------------------------------------------------------------
import React from 'react';
import HunterBoard from './HunterBoard';
import { ownerLabel, type InkOwner } from '../services/hunterBoardService';

const HunterBoardPage: React.FC<{ roomId: string }> = ({ roomId }) => {
  const me: InkOwner = (() => {
    try { return new URLSearchParams(window.location.search).get('me') === 'tutor' ? 'tutor' : 'student'; }
    catch { return 'student'; }
  })();

  return (
    <div className="hunter-skin" style={{
      position: 'fixed', inset: 0, background: 'var(--h-ground)', color: 'var(--h-cream)',
      fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--h-rule)' }}>
        <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: 'var(--h-coral)' }}>Letters hunter</span>
        <span className="text-[14px] font-bold">Write what you hear</span>
        <span className="flex-grow" />
        <span className="h-8 px-3 rounded-full text-[12px] font-bold flex items-center"
          style={{ background: 'var(--h-panel)', border: '1px solid var(--h-line)', color: 'var(--h-body)' }}>
          {ownerLabel[me]}
        </span>
      </div>

      <HunterBoard roomId={roomId} me={me} isHost={false} round={0} className="flex-grow px-3 py-3 min-h-0" />

      <p className="m-0 px-4 pb-4 pt-1 text-center text-[12.5px]" style={{ color: 'var(--h-dim)' }}>
        {me === 'student'
          ? 'Listen on the big screen, then write the letter here.'
          : 'Your ink is the teacher’s — your eraser clears his as well.'}
      </p>
    </div>
  );
};

export default HunterBoardPage;
