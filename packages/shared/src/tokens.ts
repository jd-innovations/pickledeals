/**
 * PickleDeals design tokens — ported 1:1 from the approved design (preview/pd.css).
 * Monochrome UI; product imagery provides colour. Dark is tuned separately, not inverted.
 */

export const palette = {
  light: {
    background: '#FFFFFF',
    surface: '#F4F4F3',
    surfaceElevated: '#FFFFFF',
    surfacePressed: '#E9E9E7',
    imageTile: '#F1F1EF',
    textPrimary: '#0A0A0A',
    textSecondary: '#555555',
    textTertiary: '#717171',
    border: '#E2E2E0',
    separator: '#ECECEA',
    interactive: '#0A0A0A',
    onInteractive: '#FFFFFF',
    interactivePressed: '#2D2D2D',
    overlay: 'rgba(10,10,10,0.38)',
    glass: 'rgba(255,255,255,0.80)',
    chip: '#F1F1F0',
    bubbleIncoming: '#EDEDEC',
    bubbleOutgoing: '#0A0A0A',
    onBubbleOutgoing: '#FFFFFF',
    mapLand: '#F0F0EE',
    mapRoad: '#FFFFFF',
    mapWater: '#DCDCD9',
  },
  dark: {
    background: '#0B0B0C',
    surface: '#161617',
    surfaceElevated: '#1E1E20',
    surfacePressed: '#2A2A2D',
    imageTile: '#1A1A1C',
    textPrimary: '#F5F5F4',
    textSecondary: '#A6A6A6',
    textTertiary: '#8A8A8A',
    border: '#2E2E31',
    separator: '#232326',
    interactive: '#F5F5F4',
    onInteractive: '#0B0B0C',
    interactivePressed: '#D6D6D6',
    overlay: 'rgba(0,0,0,0.60)',
    glass: 'rgba(30,30,32,0.78)',
    chip: '#1F1F21',
    bubbleIncoming: '#232326',
    bubbleOutgoing: '#F5F5F4',
    onBubbleOutgoing: '#0B0B0C',
    mapLand: '#141415',
    mapRoad: '#262628',
    mapWater: '#0E0F10',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof (typeof palette)['light'];
export type ColorTokens = Record<ColorToken, string>;

/** 4-pt grid. Screen gutter is space[4] (16). */
export const space = [0, 4, 8, 12, 16, 20, 24, 32, 40, 56] as const;
export const gutter = 16;
export const minTouchTarget = 44;

export const radius = {
  badge: 6,
  control: 10,
  tile: 16,
  card: 16,
  hero: 24,
  sheet: 28,
  capsule: 999,
} as const;

/**
 * Type scale (iOS points). Hierarchy from size and weight, not colour.
 * `tracking` is letter-spacing in points. Prices always use tabular numerals.
 */
export const type = {
  largeTitle: { size: 34, line: 41, weight: '700', tracking: -0.85 },
  title1: { size: 28, line: 34, weight: '700', tracking: -0.56 },
  title2: { size: 22, line: 28, weight: '700', tracking: -0.33 },
  title3: { size: 20, line: 25, weight: '600', tracking: -0.3 },
  headline: { size: 17, line: 22, weight: '600', tracking: -0.17 },
  body: { size: 17, line: 22, weight: '400', tracking: -0.17 },
  callout: { size: 16, line: 21, weight: '400', tracking: -0.1 },
  subhead: { size: 15, line: 20, weight: '500', tracking: 0 },
  footnote: { size: 13, line: 18, weight: '400', tracking: 0 },
  caption: { size: 12, line: 16, weight: '500', tracking: 0 },
  badge: { size: 11, line: 13, weight: '700', tracking: 0.66 },
  priceDisplay: { size: 40, line: 44, weight: '700', tracking: -1.2 },
  priceLarge: { size: 28, line: 32, weight: '700', tracking: -0.7 },
  priceCard: { size: 17, line: 22, weight: '700', tracking: -0.17 },
} as const;

export type TypeVariant = keyof typeof type;
