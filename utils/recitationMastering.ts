// utils/recitationMastering.ts
// -----------------------------------------------------------------------------
// Turns a raw microphone take into a polished per-verse recitation file.
//
// The chain follows what studio Quran recordings use (capture-side browser
// noise suppression is enabled separately in getUserMedia):
//
//   high-pass 80 Hz        room rumble / desk thumps / plosive lows
//   presence +1.5 dB @ 3.2k intelligibility lift
//   high-shelf −3 dB @ 7.8k tames the sibilance cheap mics exaggerate (س ص ش)
//   compressor 3:1          the even, "close" studio voice
//   convolution reverb 12%  a short generated room tail — the polish on
//                           studio recitations (added, never recorded)
//   silence trim            tight per-verse files that chain cleanly
//   loudness normalization  every verse lands at the same level
//   mp3 96 kbps mono        ~12 KB/s — the whole muṣḥaf fits in ~1 GB
// -----------------------------------------------------------------------------

import { Mp3Encoder } from '@breezystack/lamejs';

const SR = 44100;

let sharedCtx: AudioContext | null = null;
const decodeCtx = (): AudioContext => {
  if (!sharedCtx) sharedCtx = new AudioContext();
  return sharedCtx;
};

/** Short synthetic room impulse response: pre-delay + exponentially decaying
 *  noise. Convolving with this is what "subtle studio reverb" is. */
const makeImpulseResponse = (ctx: OfflineAudioContext): AudioBuffer => {
  const seconds = 1.3;
  const preDelay = Math.floor(0.02 * SR);
  const ir = ctx.createBuffer(1, Math.floor(seconds * SR), SR);
  const d = ir.getChannelData(0);
  for (let i = preDelay; i < d.length; i++) {
    const t = (i - preDelay) / SR;
    d[i] = (Math.random() * 2 - 1) * Math.exp(-4.2 * t);
  }
  return ir;
};

export interface MasteredTake { blob: Blob; durMs: number }

export async function masterTake(raw: Blob): Promise<MasteredTake> {
  const arrayBuf = await raw.arrayBuffer();
  const decoded = await decodeCtx().decodeAudioData(arrayBuf);

  // ── Offline processing graph (mono) ────────────────────────────────────────
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * SR) + SR, SR);
  const src = off.createBufferSource();
  src.buffer = decoded;

  const hpf = off.createBiquadFilter();
  hpf.type = 'highpass'; hpf.frequency.value = 80; hpf.Q.value = 0.7;

  const presence = off.createBiquadFilter();
  presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.9; presence.gain.value = 1.5;

  const deEss = off.createBiquadFilter();
  deEss.type = 'highshelf'; deEss.frequency.value = 7800; deEss.gain.value = -3;

  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -22; comp.knee.value = 12; comp.ratio.value = 3;
  comp.attack.value = 0.004; comp.release.value = 0.25;

  const dry = off.createGain(); dry.gain.value = 1.0;
  const verb = off.createConvolver(); verb.buffer = makeImpulseResponse(off);
  const wet = off.createGain(); wet.gain.value = 0.12;

  src.connect(hpf); hpf.connect(presence); presence.connect(deEss); deEss.connect(comp);
  comp.connect(dry); dry.connect(off.destination);
  comp.connect(verb); verb.connect(wet); wet.connect(off.destination);

  src.start();
  const rendered = await off.startRendering();
  let data = rendered.getChannelData(0);

  // ── Silence trim (keeps a natural breath of padding) ───────────────────────
  // Windowed RMS, not instantaneous samples — a residual noise floor would
  // cross a per-sample gate immediately and defeat the trim.
  {
    const win = Math.floor(0.02 * SR);
    const nWin = Math.floor(data.length / win);
    const rmsW = new Float32Array(nWin);
    let peakRms = 0;
    for (let wI = 0; wI < nWin; wI++) {
      let s = 0;
      for (let i = wI * win; i < (wI + 1) * win; i++) s += data[i] * data[i];
      rmsW[wI] = Math.sqrt(s / win);
      if (rmsW[wI] > peakRms) peakRms = rmsW[wI];
    }
    if (peakRms > 0) {
      const gate = Math.max(peakRms * 0.03, 0.003); // ≈ −30 dB rel, −50 dBFS abs
      let fw = 0; while (fw < nWin && rmsW[fw] < gate) fw++;
      let lw = nWin - 1; while (lw > fw && rmsW[lw] < gate) lw--;
      const padIn = Math.floor(0.12 * SR), padOut = Math.floor(0.35 * SR);
      data = data.slice(Math.max(0, fw * win - padIn), Math.min(data.length, (lw + 1) * win + padOut));
    }
  }

  // ── Loudness normalization: RMS to −19 dBFS, peak capped at −1.3 dBFS ─────
  let sum = 0, p2 = 0;
  for (let i = 0; i < data.length; i++) { sum += data[i] * data[i]; const a = Math.abs(data[i]); if (a > p2) p2 = a; }
  const rms = Math.sqrt(sum / Math.max(1, data.length));
  if (rms > 0 && p2 > 0) {
    const gain = Math.min(Math.pow(10, -19 / 20) / rms, Math.pow(10, -1.3 / 20) / p2);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }

  // ── MP3 encode (mono, 96 kbps) ─────────────────────────────────────────────
  const pcm = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const enc = new Mp3Encoder(1, SR, 96);
  const chunks: Uint8Array[] = [];
  const BLOCK = 1152;
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const out = enc.encodeBuffer(pcm.subarray(i, i + BLOCK));
    if (out.length) chunks.push(out);
  }
  const tail = enc.flush();
  if (tail.length) chunks.push(tail);

  return {
    blob: new Blob(chunks as BlobPart[], { type: 'audio/mpeg' }),
    durMs: Math.round((data.length / SR) * 1000),
  };
}
