// services/p2pGameChannel.ts
// -----------------------------------------------------------------------------
// WebRTC peer-to-peer transport for the online 2-player games, with the
// existing Supabase Realtime broadcast kept as signaling AND as an automatic
// fallback path.
//
// Why: Supabase broadcast rides a TCP WebSocket through a fixed-region server.
// That adds a long detour (both players → Supabase region → back) and, on weak
// connections, TCP head-of-line blocking freezes the whole stream whenever a
// packet drops. A direct WebRTC DataChannel removes the detour, and its
// unreliable mode (maxRetransmits: 0) simply skips lost packets instead of
// stalling — exactly right for 30Hz state/input streams that self-heal.
//
// Design: createGameChannel() is a DROP-IN replacement for supabase.channel()
// as used by the games — same .on('broadcast', {event}, cb), .send({type:
// 'broadcast', event, payload}), .subscribe(cb), .unsubscribe() surface. The
// games don't know which path a message took:
//   - While P2P is down (always at first): everything flows via Supabase.
//   - Handshake: guest announces itself over the Supabase channel ('rtc-sig'
//     hello), host answers with an SDP offer, trickle ICE both ways (STUN
//     only — no TURN; strict NATs just stay on the Supabase path forever,
//     which is today's behavior).
//   - Once BOTH DataChannels open: 'state'/'input' (high-frequency, loss-
//     tolerant) go over the unreliable channel, everything else over the
//     reliable ordered channel.
//   - Any P2P failure (ICE drop, channel close) instantly reverts to Supabase
//     and the guest re-announces to retry.
// If one player runs an old bundle without this file, no hello ever arrives
// and the game keeps working purely on Supabase — full backward compatibility.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

// Events that are high-frequency + loss-tolerant → unreliable channel.
const FAST_EVENTS = new Set(['state', 'input']);
const SIG_EVENT = 'rtc-sig';

// TURN keeps strict-NAT / mobile-carrier players on a fast WebRTC relay
// (~20-50ms added) instead of dropping to the Supabase broadcast fallback
// (chat-grade latency). Provide one via env (free tiers: Metered, Cloudflare):
//   VITE_TURN_URLS       comma-separated turn:/turns: urls
//   VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL
// Without env config we stay STUN-only (strict NATs use the Supabase path).
const IM_ENV = (import.meta as any).env ?? {};
const ENV_TURN_URLS = (IM_ENV.VITE_TURN_URLS as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean);
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ...(ENV_TURN_URLS?.length
      ? [{ urls: ENV_TURN_URLS, username: IM_ENV.VITE_TURN_USERNAME ?? '', credential: IM_ENV.VITE_TURN_CREDENTIAL ?? '' }]
      : []),
  ],
};
const HELLO_INTERVAL_MS = 2500; // guest re-announces until P2P is up

type Role = 'host' | 'guest';
type SigMsg =
  | { kind: 'hello'; from: Role }
  | { kind: 'offer'; from: Role; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; from: Role; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: Role; cand: RTCIceCandidateInit };

export interface P2PGameChannel {
  on(type: 'broadcast', filter: { event: string }, cb: (msg: { payload: any }) => void): void;
  send(msg: { type: 'broadcast'; event: string; payload: any }): void;
  subscribe(cb?: (status: string) => void): void;
  unsubscribe(): void;
  /** true while the direct WebRTC path carries the game traffic */
  isDirect(): boolean;
  /** notified whenever the path flips between direct P2P and Supabase relay */
  onPathChange(cb: (direct: boolean) => void): void;
}

export function createGameChannel(name: string, role: Role): P2PGameChannel {
  const ch = supabase.channel(name, { config: { broadcast: { self: false } } });
  const handlers = new Map<string, (msg: { payload: any }) => void>();

  let pc: RTCPeerConnection | null = null;
  let fast: RTCDataChannel | null = null;
  let safe: RTCDataChannel | null = null;
  let direct = false;
  let destroyed = false;
  let helloTimer: number | null = null;
  let pathCb: ((direct: boolean) => void) | null = null;
  const pendingIce: RTCIceCandidateInit[] = [];

  const deliver = (event: string, payload: any) => handlers.get(event)?.({ payload });

  const setDirect = (v: boolean) => {
    if (direct === v || destroyed) return;
    direct = v;
    pathCb?.(v);
    if (!v && role === 'guest') startHello(); // retry from the guest side
  };

  const teardownPc = () => {
    fast?.close(); safe?.close();
    pc?.close();
    fast = safe = null; pc = null;
    pendingIce.length = 0;
    setDirect(false);
  };

  const sendSig = (msg: SigMsg) => {
    ch.send({ type: 'broadcast', event: SIG_EVENT, payload: msg });
  };

  const wireDataChannel = (dc: RTCDataChannel) => {
    if (dc.label === 'fast') fast = dc; else safe = dc;
    dc.onmessage = ev => {
      try { const { e, p } = JSON.parse(ev.data); deliver(e, p); } catch { /* ignore */ }
    };
    dc.onopen = () => { if (fast?.readyState === 'open' && safe?.readyState === 'open') setDirect(true); };
    dc.onclose = () => setDirect(false);
    dc.onerror = () => setDirect(false);
  };

  const setupPc = () => {
    teardownPc();
    pc = new RTCPeerConnection(RTC_CONFIG);
    pc.onicecandidate = e => { if (e.candidate) sendSig({ kind: 'ice', from: role, cand: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (!pc) return;
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') setDirect(false);
    };
    if (role === 'host') {
      wireDataChannel(pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
      wireDataChannel(pc.createDataChannel('safe', { ordered: true }));
    } else {
      pc.ondatachannel = ev => wireDataChannel(ev.channel);
    }
  };

  const flushPendingIce = async () => {
    if (!pc?.remoteDescription) return;
    while (pendingIce.length) {
      const c = pendingIce.shift()!;
      try { await pc.addIceCandidate(c); } catch { /* stale candidate */ }
    }
  };

  const handleSig = async (msg: SigMsg) => {
    if (destroyed || msg.from === role) return;
    try {
      if (msg.kind === 'hello' && role === 'host' && !direct) {
        // Fresh (re)connect attempt initiated by the guest.
        setupPc();
        const offer = await pc!.createOffer();
        await pc!.setLocalDescription(offer);
        sendSig({ kind: 'offer', from: role, sdp: offer });
      } else if (msg.kind === 'offer' && role === 'guest') {
        setupPc();
        await pc!.setRemoteDescription(msg.sdp);
        const answer = await pc!.createAnswer();
        await pc!.setLocalDescription(answer);
        sendSig({ kind: 'answer', from: role, sdp: answer });
        flushPendingIce();
      } else if (msg.kind === 'answer' && role === 'host' && pc) {
        await pc.setRemoteDescription(msg.sdp);
        flushPendingIce();
      } else if (msg.kind === 'ice' && pc) {
        if (pc.remoteDescription) { try { await pc.addIceCandidate(msg.cand); } catch { /* stale */ } }
        else pendingIce.push(msg.cand);
      }
    } catch { /* a failed handshake just leaves us on the Supabase path */ }
  };

  const startHello = () => {
    if (role !== 'guest' || destroyed) return;
    stopHello();
    sendSig({ kind: 'hello', from: role });
    helloTimer = window.setInterval(() => {
      if (direct || destroyed) { stopHello(); return; }
      sendSig({ kind: 'hello', from: role });
    }, HELLO_INTERVAL_MS);
  };
  const stopHello = () => { if (helloTimer !== null) { clearInterval(helloTimer); helloTimer = null; } };

  // Signaling handler must be bound before subscribe().
  ch.on('broadcast', { event: SIG_EVENT }, ({ payload }: { payload: SigMsg }) => { handleSig(payload); });

  return {
    on(_type, filter, cb) {
      handlers.set(filter.event, cb);
      ch.on('broadcast', { event: filter.event }, cb as any);
    },
    send({ event, payload }) {
      if (direct) {
        const dc = FAST_EVENTS.has(event) ? fast : safe;
        if (dc?.readyState === 'open') {
          try { dc.send(JSON.stringify({ e: event, p: payload })); return; } catch { setDirect(false); }
        } else {
          setDirect(false);
        }
      }
      ch.send({ type: 'broadcast', event, payload });
    },
    subscribe(cb) {
      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') startHello();
        cb?.(status);
      });
    },
    unsubscribe() {
      destroyed = true;
      stopHello();
      teardownPc();
      ch.unsubscribe();
    },
    isDirect: () => direct,
    onPathChange(cb) { pathCb = cb; },
  };
}
