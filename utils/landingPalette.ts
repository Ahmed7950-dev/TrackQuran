// utils/landingPalette.ts
// ---------------------------------------------------------------------------
// The public pages (landing, sign-in window, tutor application) in each of the
// site's four looks (utils/theme.ts). They are styled inline, not with
// Tailwind classes, so the theme stylesheet in index.html never reaches them;
// this table is how they follow the theme instead.
//
//   light    cream and green, the brand look
//   reading  warmer paper and brown ink, like the app's reading mode
//   dark     the app's blue-grey night with emerald
//   amber    the app's black and orange
// ---------------------------------------------------------------------------
import type { AppTheme } from './theme';

export interface LandingPalette {
  /** Page background and the alternate band between sections. */
  bg: string; alt: string;
  /** Cards, panels and inputs. */
  card: string; input: string;
  text: string; muted: string; border: string;
  /** Sticky header (translucent). */
  nav: string;
  /** Section titles, and the one highlighted word in each title. */
  heading: string; lime: string;
  /** The short yellow bar under the hero title, the current carousel dot,
   *  price badges. Text on it is always dark. */
  yellow: string;
  /** Main buttons. */
  accent: string; onAccent: string; accentShadow: string;
  /** Outline buttons and links. */
  outline: string;
  /** Soft pill behind small labels. */
  chipBg: string; chipText: string;
  /** Eyebrows and Arabic words (`gold`), gold on a dark band (`goldSoft`). */
  gold: string; goldSoft: string;
  /** The coloured bands (price total, closing banner, footer). */
  band: string; bandDeep: string; onBand: string; onBandMuted: string;
  /** Button on a band. */
  bandButton: string; onBandButton: string;
  /** Games section wash. */
  kidsBg: string;
  /** White-text logo? */
  darkLogo: boolean;
}

// The values follow the redesign made in Claude Design (Nov 2026): the banners'
// look, a bold serif title with one word in bright green and a yellow bar.
const LIGHT: LandingPalette = {
  bg: '#FBF8F1', alt: '#F2EEE3', card: '#FFFFFF', input: '#FFFFFF',
  text: '#12291C', muted: '#56645A', border: '#E6E0D0',
  nav: 'rgba(251,248,241,0.9)', heading: '#0E4A2B', lime: '#4E8A1F', yellow: '#F2B807',
  accent: '#0E4A2B', onAccent: '#FFFFFF', accentShadow: 'rgba(14,74,43,0.18)',
  outline: '#0E4A2B', chipBg: '#E3EED8', chipText: '#2B5A16',
  gold: '#9A7424', goldSoft: '#E1C588',
  band: '#0E4A2B', bandDeep: '#08321E', onBand: '#FFFFFF', onBandMuted: 'rgba(255,255,255,0.78)',
  bandButton: '#F2B807', onBandButton: '#1C1606',
  kidsBg: '#F2EEE3',
  darkLogo: false,
};

const READING: LandingPalette = {
  bg: '#F6F0E3', alt: '#EDE4D0', card: '#FBF7EE', input: '#FEFCF8',
  text: '#3D3528', muted: '#6B604F', border: '#E0D3BB',
  nav: 'rgba(246,240,227,0.9)', heading: '#4F3F24', lime: '#5E6E1E', yellow: '#D9A21B',
  accent: '#5B4A2C', onAccent: '#FFF9EC', accentShadow: 'rgba(79,63,36,0.18)',
  outline: '#5B4A2C', chipBg: '#E6DCC4', chipText: '#4F3F24',
  gold: '#8C6A26', goldSoft: '#E6CC94',
  band: '#5B4A2C', bandDeep: '#3F321D', onBand: '#FFF9EC', onBandMuted: 'rgba(255,249,236,0.78)',
  bandButton: '#E6CC94', onBandButton: '#3F321D',
  kidsBg: '#EDE4D0',
  darkLogo: false,
};

const DARK: LandingPalette = {
  bg: '#111827', alt: '#0D1420', card: '#1F2937', input: '#111827',
  text: '#F3F4F6', muted: '#A3ACB9', border: '#374151',
  nav: 'rgba(17,24,39,0.9)', heading: '#6EE7B7', lime: '#A3E635', yellow: '#FBBF24',
  accent: '#047857', onAccent: '#FFFFFF', accentShadow: 'rgba(0,0,0,0.45)',
  outline: '#6EE7B7', chipBg: 'rgba(16,185,129,0.16)', chipText: '#6EE7B7',
  gold: '#D4B06A', goldSoft: '#E9D3A1',
  band: '#0B3B2C', bandDeep: '#0A101C', onBand: '#F3F4F6', onBandMuted: 'rgba(243,244,246,0.74)',
  bandButton: '#34D399', onBandButton: '#04261B',
  kidsBg: '#0D1420',
  darkLogo: true,
};

const AMBER: LandingPalette = {
  bg: '#0D0E10', alt: '#131417', card: '#17191C', input: '#0D0E10',
  text: '#F1EDE6', muted: '#A39C90', border: '#2A2D31',
  nav: 'rgba(13,14,16,0.9)', heading: '#F2C67A', lime: '#E8A33D', yellow: '#E8A33D',
  accent: '#E8A33D', onAccent: '#1A1206', accentShadow: 'rgba(0,0,0,0.5)',
  outline: '#E8A33D', chipBg: 'rgba(232,163,61,0.14)', chipText: '#F2C67A',
  gold: '#E8A33D', goldSoft: '#F2C67A',
  band: '#1D1912', bandDeep: '#0A0A0B', onBand: '#F1EDE6', onBandMuted: 'rgba(241,237,230,0.72)',
  bandButton: '#E8A33D', onBandButton: '#1A1206',
  kidsBg: '#131417',
  darkLogo: true,
};

export const LANDING_PALETTES: Record<AppTheme, LandingPalette> = {
  light: LIGHT, reading: READING, dark: DARK, amber: AMBER,
};

export const landingPalette = (theme: AppTheme): LandingPalette => LANDING_PALETTES[theme] ?? LIGHT;
