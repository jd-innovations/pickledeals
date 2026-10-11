/**
 * Placeholder art for catalog rows without a licensed image (D8). Mirrors
 * apps/mobile/src/commerce/catalogArt.ts so a product looks the same on the website and in the app.
 */
export type ArtKind = 'paddle' | 'shoe' | 'ball' | 'bag' | 'grip' | 'eyewear' | 'apparel' | 'machine' | 'net';
export type Art = { kind: ArtKind; c1: string; c2: string };

const CATEGORY_ART: Record<string, Art> = {
  paddles: { kind: 'paddle', c1: '#1F5FD1', c2: '#C8F03C' },
  shoes: { kind: 'shoe', c1: '#FF5D8F', c2: '#1C1C1C' },
  balls: { kind: 'ball', c1: '#D8F23A', c2: '#000000' },
  bags: { kind: 'bag', c1: '#1D3557', c2: '#E63946' },
  apparel: { kind: 'apparel', c1: '#06D6A0', c2: '#073B4C' },
  grips: { kind: 'grip', c1: '#4CC9F0', c2: '#F72585' },
  eyewear: { kind: 'eyewear', c1: '#1C1C1C', c2: '#7B2CBF' },
  nets: { kind: 'net', c1: '#FFFFFF', c2: '#FF7F11' },
  'ball-machines': { kind: 'machine', c1: '#FF7F11', c2: '#FFFFFF' },
  training: { kind: 'ball', c1: '#FF8A00', c2: '#000000' },
  'paddle-accessories': { kind: 'grip', c1: '#2B2D42', c2: '#C8F03C' },
  'court-accessories': { kind: 'net', c1: '#1C1C1C', c2: '#3A86FF' },
};

const PRODUCT_PAIRS: readonly [string, string][] = [
  ['#1F5FD1', '#C8F03C'],
  ['#26282B', '#9BE15D'],
  ['#D7263D', '#F4D35E'],
  ['#0F9D8A', '#FFD166'],
  ['#FF6B35', '#1C1C1C'],
  ['#111111', '#F2C14E'],
  ['#2B2D42', '#EF233C'],
  ['#1D3557', '#E63946'],
  ['#06D6A0', '#073B4C'],
  ['#4CC9F0', '#F72585'],
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function categoryArt(categorySlug: string): Art {
  return CATEGORY_ART[categorySlug] ?? CATEGORY_ART.paddles!;
}

export function productArt(productSlug: string, categorySlug: string): Art {
  const base = categoryArt(categorySlug);
  // Nets, machines and balls read best in their category colours; everything else varies per product.
  if (base.kind === 'net' || base.kind === 'machine' || base.kind === 'ball') return base;
  const [c1, c2] = PRODUCT_PAIRS[hash(productSlug) % PRODUCT_PAIRS.length]!;
  return { kind: base.kind, c1, c2 };
}
