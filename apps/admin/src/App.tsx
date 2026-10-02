import { palette } from '@pickledeals/shared';

/**
 * Internal admin (D7). Intentionally empty until Phase 2, which adds Supabase auth (admin role
 * claim) and catalog CRUD: brands, categories, products, variants, images with provenance.
 */
const SECTIONS = [
  'Catalog — brands, categories, products, variants, images',
  'Retail — retailers, offers, promo codes, deals',
  'Marketplace — moderation, custom-item review & linking, reports',
  'Ingestion — imports and match review',
];

export default function App() {
  const c = palette.light;
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 24px', color: c.textPrimary }}>
      <h1 style={{ fontSize: 34, letterSpacing: '-0.02em', margin: 0 }}>PickleDeals Admin</h1>
      <p style={{ color: c.textSecondary, fontSize: 17 }}>Internal tool. Sections are built from Phase 2 onward.</p>
      <ul style={{ padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
        {SECTIONS.map((s) => (
          <li key={s} style={{ padding: '14px 16px', borderRadius: 16, background: c.surface, fontSize: 15 }}>
            {s}
          </li>
        ))}
      </ul>
    </main>
  );
}
