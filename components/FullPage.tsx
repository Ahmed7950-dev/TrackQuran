// components/FullPage.tsx
// ---------------------------------------------------------------------------
// A screen that REPLACES what is behind it instead of floating over it.
//
// Three things make it a page rather than a layer:
//
//  • It is rendered into <body>, not where it was written. A `fixed` element
//    nested inside the app is at the mercy of every ancestor: one transform,
//    filter or backdrop-blur anywhere above it turns `inset-0` into "inset
//    from that ancestor" and caps its z-index inside that ancestor's stacking
//    context — which is how a header or a bottom bar ends up drawn over a
//    full-screen page. A direct child of <body> answers to nothing.
//  • The page behind cannot scroll while it is open, so nothing moves or
//    peeks at the edges.
//  • It owns a history entry, so the phone's back gesture (and the browser's
//    back button) close the page and return to what was underneath, instead
//    of leaving the site altogether.
//
// Escape is deliberately NOT bound here: the screens inside use it for their
// own undo (clearing a whiteboard selection), and a page that closes under
// that would lose work.
// ---------------------------------------------------------------------------
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** Close this page: its back button, or the device's back gesture. */
  onBack: () => void;
  /** Usually a dark page's own background; override for a black one. */
  className?: string;
  children: React.ReactNode;
}

const FullPage: React.FC<Props> = ({ onBack, className, children }) => {
  const backRef = useRef(onBack);
  useEffect(() => { backRef.current = onBack; }, [onBack]);

  // Nothing behind moves while this is open.
  useEffect(() => {
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { body.style.overflow = prev; };
  }, []);

  // One history entry per open page, so Back goes back one page.
  useEffect(() => {
    const mark = `fullpage:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ ...(window.history.state ?? {}), fullPage: mark }, '');
    const onPop = () => backRef.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed from inside (a button, not the back gesture): the entry we
      // pushed is still the current one, so take it off the stack again.
      if ((window.history.state as any)?.fullPage === mark) window.history.back();
    };
  }, []);

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex flex-col ${className ?? 'bg-white dark:bg-gray-900'}`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {children}
    </div>,
    document.body,
  );
};

export default FullPage;
