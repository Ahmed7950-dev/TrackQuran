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
  /** Section titles. */
  heading: string;
  /** Main buttons. */
  accent: string; onAccent: string; accentShadow: string;
  /** Outline buttons and links. */
  outline: string;
  /** Soft pill behind small labels. */
  chipBg: string; chipText: string;
  /** Gold: eyebrows, Arabic words, stars. */
  gold: string; goldSoft: string;
  /** The coloured bands (Quran reader, price card, closing banner, footer). */
  band: string; bandDeep: string; onBand: string; onBandMuted: string;
  /** Button on a band. */
  bandButton: string; onBandButton: string;
  /** Games section wash. */
  kidsBg: string;
  /** White-text logo? */
  darkLogo: boolean;
}

const LIGHT: LandingPalette = {
  bg: '#FAF6EC', alt: '#E8EFE7', card: '#FFFDF8', input: '#FFFFFF',
  text: '#1A2B22', muted: '#5C6B62', border: '#E5DFCE',
  nav: 'rgba(250,246,236,0.88)', heading: '#0E4A2B',
  accent: '#0E4A2B', onAccent: '#FFFFFF', accentShadow: 'rgba(14,74,43,0.28)',
  outline: '#0E4A2B', chipBg: '#E8EFE7', chipText: '#0E4A2B',
  gold: '#C9A24A', goldSoft: '#E1C588',
  band: '#0E4A2B', bandDeep: '#08321E', onBand: '#FFFFFF', onBandMuted: 'rgba(255,255,255,0.75)',
  bandButton: '#C9A24A', onBandButton: '#08321E',
  kidsBg: 'linear-gradient(180deg, #E9F4EC 0%, #FAF6EC 100%)',
  darkLogo: false,
};

const READING: LandingPalette = {
  bg: '#F6F0E3', alt: '#EDE4D0', card: '#FBF7EE', input: '#FEFCF8',
  text: '#3D3528', muted: '#7A7060', border: '#E2D6C0',
  nav: 'rgba(246,240,227,0.9)', heading: '#4F3F24',
  accent: '#5B4A2C', onAccent: '#FFF9EC', accentShadow: 'rgba(91,74,44,0.25)',
  outline: '#5B4A2C', chipBg: '#EDE4D0', chipText: '#5B4A2C',
  gold: '#B8893A', goldSoft: '#E6CC94',
  band: '#5B4A2C', bandDeep: '#3F321D', onBand: '#FFF9EC', onBandMuted: 'rgba(255,249,236,0.75)',
  bandButton: '#E6CC94', onBandButton: '#3F321D',
  kidsBg: 'linear-gradient(180deg, #EFE6D2 0%, #F6F0E3 100%)',
  darkLogo: false,
};

const DARK: LandingPalette = {
  bg: '#111827', alt: '#0D1420', card: '#1F2937', input: '#111827',
  text: '#F3F4F6', muted: '#9CA3AF', border: '#374151',
  nav: 'rgba(17,24,39,0.88)', heading: '#6EE7B7',
  accent: '#047857', onAccent: '#FFFFFF', accentShadow: 'rgba(4,120,87,0.35)',
  outline: '#6EE7B7', chipBg: 'rgba(16,185,129,0.14)', chipText: '#6EE7B7',
  gold: '#D4B06A', goldSoft: '#E9D3A1',
  band: '#0B3B2C', bandDeep: '#0A101C', onBand: '#F3F4F6', onBandMuted: 'rgba(243,244,246,0.72)',
  bandButton: '#10B981', onBandButton: '#04261B',
  kidsBg: 'linear-gradient(180deg, #0F1D24 0%, #111827 100%)',
  darkLogo: true,
};

const AMBER: LandingPalette = {
  bg: '#0D0E10', alt: '#131417', card: '#17191C', input: '#0D0E10',
  text: '#F1EDE6', muted: '#A39C90', border: '#2A2D31',
  nav: 'rgba(13,14,16,0.88)', heading: '#E8A33D',
  accent: '#E8A33D', onAccent: '#1A1206', accentShadow: 'rgba(232,163,61,0.25)',
  outline: '#E8A33D', chipBg: 'rgba(232,163,61,0.14)', chipText: '#F2C67A',
  gold: '#E8A33D', goldSoft: '#F2C67A',
  band: '#1D1912', bandDeep: '#0A0A0B', onBand: '#F1EDE6', onBandMuted: 'rgba(241,237,230,0.7)',
  bandButton: '#E8A33D', onBandButton: '#1A1206',
  kidsBg: 'linear-gradient(180deg, #17140F 0%, #0D0E10 100%)',
  darkLogo: true,
};

export const LANDING_PALETTES: Record<AppTheme, LandingPalette> = {
  light: LIGHT, reading: READING, dark: DARK, amber: AMBER,
};

export const landingPalette = (theme: AppTheme): LandingPalette => LANDING_PALETTES[theme] ?? LIGHT;
