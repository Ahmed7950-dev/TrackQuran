// services/p2pGameChannel.ts
// -----------------------------------------------------------------------------
// WebRTC peer-to-peer transport for ALL online games (2-player AND rooms),
// with the Supabase Realtime broadcast kept as signaling and automatic
// fallback. Host-star topology: every guest holds one RTCPeerConnection to
// the host; guests never talk to each other (no game needs it — all six are
// hub-and-spoke).
//
// Why: Supabase Realtime bills every message once per send PLUS once per
// subscriber, so a 5-player room at 30Hz costs ~750 billed messages/second.
// Data channels cost nothing, remove the fixed-region detour, and their
// unreliable mode skips lost packets instead of head-of-line blocking.
//
// Path rules (the core of the design — keep these in sync with the games):
//   - Guest → host: over the guest's data channel when open, else broadcast.
//     The host consumes both paths at all times (a guest sends on exactly
//     one path, so the host never sees duplicates).
//   - Host → guests: every game event is mirrored onto each connected peer's
//     data channel ('state'/'input' on the unreliable one, the rest on the
//     reliable one). A broadcast copy goes out ONLY while at least one known
//     guest lacks an open channel — and for streamSend() traffic that copy is
//     thinned to ~12Hz (RELAY_STREAM_MS).
//   - While a guest's direct path is up it IGNORES all broadcast game events:
//     everything it needs arrives via its data channel, so the broadcast
//     copies meant for the unconnected peers can't double-deliver.
//   - Any P2P failure reverts that peer to Supabase instantly; the guest
//     re-announces (hello) to retry, and the host resumes broadcast copies.
//
// Compat note: a guest running an old bundle never completes the handshake,
// stays a known-but-unconnected peer via its game-level traffic? No — the
// channel only learns peers from rtc 'hello's. An old-bundle guest therefore
// only works while some other unconnected peer keeps broadcasts flowing, or
// in a session where no peer connects at all. Sessions are always opened
// fresh from lesson links, so mixed-bundle rooms are a non-issue in practice.
//
// Sequence guard: the fast channel is unordered; frames carry a per-event
// sequence and receivers drop stale ones (Reading Battle's absolute action
// counters would double-fire if an old input frame landed after a newer one).
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

// Events that are high-frequency + loss-tolerant → unreliable channel.
const FAST_EVENTS = new Set(['state', 'input']);
const SIG_EVENT = 'rtc-sig';

// TURN keeps strict-NAT / mobile-carrier players on a fast WebRTC relay
// (~20-50ms added) instead of dropping to the Supabase broadcast fallback.
//   VITE_TURN_URLS       comma-separated turn:/turns: urls
//   VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL
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
const HELLO_INTERVAL_MS = 2500;  // guest re-announces until its P2P is up
const PEER_EXPIRE_MS = 12_000;   // host forgets a silent unconnected peer
const RELAY_STREAM_MS = 80;      // broadcast copy of a stream ≈ 12.5Hz max
const STREAM_KEEPALIVE_MS = 1500;// resend unchanged stream payloads this often

type Role = 'host' | 'guest';
type SigMsg =
  | { kind: 'hello'; from: Role; pid?: string }
  | { kind: 'offer'; from: Role; pid?: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; from: Role; pid?: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: Role; pid?: string; cand: RTCIceCandidateInit };

export interface NetStats { wsOut: number; wsIn: number; dcOut: number; dcIn: number }
export interface P2PGameChannel {
  on(type: 'broadcast', filter: { event: string }, cb: (msg: { payload: any }) => void): void;
  send(msg: { type: 'broadcast'; event: string; payload: any }): void;
  /** High-frequency stream send: dedupes identical payloads (with keepalive)
   *  and thins the Supabase copy to ~12Hz while data channels carry the full
   *  rate. Call it every tick; it decides what actually goes out. */
  streamSend(event: string, payload: any): void;
  subscribe(cb?: (status: string) => void): void;
  unsubscribe(): void;
  /** true while the direct WebRTC path carries this end's game traffic
   *  (host: every known peer connected; guest: own channel open) */
  isDirect(): boolean;
  /** notified whenever the path flips between direct P2P and Supabase relay */
  onPathChange(cb: (direct: boolean) => void): void;
  getStats(): NetStats;
}

interface Peer {
  pc: RTCPeerConnection;
  fast: RTCDataChannel | null;
  safe: RTCDataChannel | null;
  open: boolean;
  createdAt: number;
  lastHello: number;
  lastSeq: Map<string, number>; // per-event receive guard (unordered channel)
}

// Global counters so the lab can measure the reduction (window.__gcStats).
const stats: NetStats = { wsOut: 0, wsIn: 0, dcOut: 0, dcIn: 0 };
if (typeof window !== 'undefined') (window as any).__gcStats = stats;

// opts.p2p is legacy: rooms used to pass false when the fast path was 1:1.
// The host-star rewrite serves any peer count, so the flag is ignored.
export function createGameChannel(name: string, role: Role, _opts?: { p2p?: boolean }): P2PGameChannel {
  const ch = supabase.channel(name, { config: { broadcast: { self: false } } });
  const handlers = new Map<string, (msg: { payload: any }) => void>();

  const myPid = role === 'guest' ? Math.random().toString(36).slice(2, 10) : 'host';
  const peers = new Map<string, Peer>();   // host: one per guest; guest: 'host'
  let direct = false;                      // this end's aggregate path state
  let destroyed = false;
  let helloTimer: number | null = null;
  let pathCb: ((direct: boolean) => void) | null = null;
  const pendingIce = new Map<string, RTCIceCandidateInit[]>();
  const sendSeq = new Map<string, number>();          // per-event DC frame seq
  const lastStream = new Map<string, { json: string; sentAt: number; relayedAt: number }>();

  const deliver = (event: string, payload: any) => handlers.get(event)?.({ payload });

  const recomputeDirect = () => {
    const v = role === 'guest'
      ? (peers.get('host')?.open ?? false)
      : peers.size > 0 && [...peers.values()].every(p => p.open);
    if (v === direct || destroyed) return;
    direct = v;
    pathCb?.(v);
    if (!v && role === 'guest') startHello();
  };

  const dropPeer = (pid: string) => {
    const p = peers.get(pid);
    if (!p) return;
    try { p.fast?.close(); p.safe?.close(); p.pc.close(); } catch { /* already gone */ }
    peers.delete(pid);
    pendingIce.delete(pid);
    recomputeDirect();
  };

  const sendSig = (msg: SigMsg) => { stats.wsOut++; ch.send({ type: 'broadcast', event: SIG_EVENT, payload: msg }); };

  const wireDataChannel = (peer: Peer, dc: RTCDataChannel) => {
    if (dc.label === 'fast') peer.fast = dc; else peer.safe = dc;
    dc.onmessage = ev => {
      stats.dcIn++;
      try {
        const { e, p, q } = JSON.parse(ev.data);
        if (typeof q === 'number') {
          const last = peer.lastSeq.get(e) ?? -1;
          if (q <= last) return; // stale frame off the unordered channel
          peer.lastSeq.set(e, q);
        }
        deliver(e, p);
      } catch { /* ignore malformed */ }
    };
    const refresh = () => {
      peer.open = peer.fast?.readyState === 'open' && peer.safe?.readyState === 'open';
      recomputeDirect();
    };
    dc.onopen = refresh;
    dc.onclose = refresh;
    dc.onerror = refresh;
  };

  const setupPeer = (pid: string): Peer => {
    dropPeer(pid);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const now = performance.now();
    const peer: Peer = { pc, fast: null, safe: null, open: false, createdAt: now, lastHello: now, lastSeq: new Map() };
    peers.set(pid, peer);
    pc.onicecandidate = e => { if (e.candidate) sendSig({ kind: 'ice', from: role, pid, cand: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peer.open = false;
        recomputeDirect();
      }
    };
    if (role === 'host') {
      wireDataChannel(peer, pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 }));
      wireDataChannel(peer, pc.createDataChannel('safe', { ordered: true }));
    } else {
      pc.ondatachannel = ev => wireDataChannel(peer, ev.channel);
    }
    return peer;
  };

  const flushPendingIce = async (pid: string) => {
    const peer = peers.get(pid);
    const q = pendingIce.get(pid);
    if (!peer?.pc.remoteDescription || !q) return;
    while (q.length) {
      const c = q.shift()!;
      try { await peer.pc.addIceCandidate(c); } catch { /* stale candidate */ }
    }
  };

  const handleSig = async (msg: SigMsg) => {
    if (destroyed || msg.from === role) return;
    // Host keys peers by the guest's pid; a guest only heeds messages for it.
    const pid = msg.pid ?? (role === 'host' ? 'legacy' : myPid);
    if (role === 'guest' && msg.pid && msg.pid !== myPid) return;
    try {
      if (msg.kind === 'hello' && role === 'host') {
        const now = performance.now();
        const existing = peers.get(pid);
        if (existing) {
          existing.lastHello = now;
          if (existing.open) return;            // already connected, stray hello
          // Handshake still in flight (ICE can outlast the 2.5s hello beat):
          // don't tear it down unless it's clearly dead or stuck.
          const st = existing.pc.connectionState;
          const stuck = now - existing.createdAt > 8000;
          if (!stuck && st !== 'failed' && st !== 'closed' && st !== 'disconnected') return;
        }
        const peer = setupPeer(pid);
        const offer = await peer.pc.createOffer();
        await peer.pc.setLocalDescription(offer);
        sendSig({ kind: 'offer', from: role, pid, sdp: offer });
      } else if (msg.kind === 'offer' && role === 'guest') {
        const peer = setupPeer('host');
        await peer.pc.setRemoteDescription(msg.sdp);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        sendSig({ kind: 'answer', from: role, pid: myPid, sdp: answer });
        flushPendingIce('host');
      } else if (msg.kind === 'answer' && role === 'host') {
        const peer = peers.get(pid);
        if (!peer) return;
        await peer.pc.setRemoteDescription(msg.sdp);
        flushPendingIce(pid);
      } else if (msg.kind === 'ice') {
        const key = role === 'host' ? pid : 'host';
        const peer = peers.get(key);
        if (peer?.pc.remoteDescription) { try { await peer.pc.addIceCandidate(msg.cand); } catch { /* stale */ } }
        else {
          if (!pendingIce.has(key)) pendingIce.set(key, []);
          pendingIce.get(key)!.push(msg.cand);
        }
      }
    } catch { /* a failed handshake just leaves that peer on the Supabase path */ }
  };

  const startHello = () => {
    if (role !== 'guest' || destroyed) return;
    stopHello();
    sendSig({ kind: 'hello', from: role, pid: myPid });
    helloTimer = window.setInterval(() => {
      if (direct || destroyed) { stopHello(); return; }
      sendSig({ kind: 'hello', from: role, pid: myPid });
    }, HELLO_INTERVAL_MS);
  };
  const stopHello = () => { if (helloTimer !== null) { clearInterval(helloTimer); helloTimer = null; } };

  // Host: forget unconnected peers that stopped announcing (left the page) so
  // they don't force broadcast copies forever.
  const reaper = role === 'host'
    ? window.setInterval(() => {
        const now = performance.now();
        for (const [pid, p] of peers) {
          if (!p.open && now - p.lastHello > PEER_EXPIRE_MS) dropPeer(pid);
        }
      }, 4000)
    : null;

  const dcSendAll = (event: string, payload: any): boolean => {
    // Returns true if every KNOWN peer got the frame over its data channel.
    let allDirect = peers.size > 0;
    let frame: string | null = null;
    for (const p of peers.values()) {
      const dc = FAST_EVENTS.has(event) ? p.fast : p.safe;
      if (dc?.readyState === 'open') {
        if (frame === null) {
          const q = (sendSeq.get(event) ?? 0) + 1;
          sendSeq.set(event, q);
          frame = JSON.stringify({ e: event, p: payload, q });
        }
        try { dc.send(frame); stats.dcOut++; } catch { p.open = false; allDirect = false; }
      } else {
        allDirect = false;
      }
    }
    if (!allDirect) recomputeDirect();
    return allDirect;
  };

  const wsSend = (event: string, payload: any) => {
    stats.wsOut++;
    ch.send({ type: 'broadcast', event, payload });
  };

  // Signaling handler must be bound before subscribe().
  ch.on('broadcast', { event: SIG_EVENT }, ({ payload }: { payload: SigMsg }) => { stats.wsIn++; handleSig(payload); });

  // DEV: lab hook to simulate a live WebRTC failure (fires the same onclose
  // path a real network drop does). Last-created channel wins; harmless in prod.
  if (typeof window !== 'undefined') {
    (window as any).__gcKillPeers = () => { for (const p of peers.values()) { try { p.fast?.close(); p.safe?.close(); p.pc.close(); } catch { /* */ } } };
  }

  return {
    on(_type, filter, cb) {
      handlers.set(filter.event, cb);
      ch.on('broadcast', { event: filter.event }, (msg: any) => {
        stats.wsIn++;
        // While our direct path is up, everything we need rides the data
        // channel — broadcast copies are for the unconnected peers.
        if (role === 'guest' && direct) return;
        cb(msg);
      });
    },

    send({ event, payload }) {
      const allDirect = dcSendAll(event, payload);
      if (!allDirect) wsSend(event, payload);
    },

    streamSend(event, payload) {
      const now = performance.now();
      const json = JSON.stringify(payload);
      const prev = lastStream.get(event);
      if (prev && prev.json === json && now - prev.sentAt < STREAM_KEEPALIVE_MS) return; // idle: nothing changed
      const entry = prev ?? { json: '', sentAt: 0, relayedAt: 0 };
      entry.json = json; entry.sentAt = now;
      lastStream.set(event, entry);
      const allDirect = dcSendAll(event, payload);
      if (!allDirect && now - entry.relayedAt >= RELAY_STREAM_MS) {
        entry.relayedAt = now;
        wsSend(event, payload);
      }
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
      if (reaper !== null) clearInterval(reaper);
      for (const pid of [...peers.keys()]) dropPeer(pid);
      ch.unsubscribe();
    },

    isDirect: () => direct,
    onPathChange(cb) { pathCb = cb; },
    getStats: () => ({ ...stats }),
  };
}
