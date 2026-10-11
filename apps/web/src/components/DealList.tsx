import Link from 'next/link';

import type { BrandSummary, CategorySummary } from '@/data/catalog';
import { fetchDeals, SORTS, type Deal, type FeedQuery, type Sort } from '@/data/deals';

import { DealCard } from './Cards';
import { Icon } from './Icon';
import { AutoSubmit } from './client/Chrome';

/**
 * Deal grid with the DealSeek-style filter sidebar (approved mockup "Deal list + filters"). Filters are
 * a plain GET form, so every filtered view has a shareable address and works without JavaScript; a
 * small client helper submits it as soon as a filter changes.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

const PAGE = 48;
const KINDS: { value: Deal['kind']; label: string }[] = [
  { value: 'price_drop', label: 'Price drop' },
  { value: 'sale', label: 'Sale' },
  { value: 'promo', label: 'Promo code' },
];
const SORT_LABEL: Record<Sort, string> = {
  best: 'Best deal',
  discount: 'Biggest discount',
  drop: 'Biggest drop',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  ending: 'Ending soonest',
  newest: 'Newest',
};

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const dollars = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

export function parseFilters(sp: SearchParams) {
  const sort = one(sp.sort) as Sort | undefined;
  return {
    category: one(sp.category) || undefined,
    brands: list(sp.brand),
    kinds: list(sp.kind).filter((k): k is Deal['kind'] => KINDS.some((x) => x.value === k)),
    minCents: dollars(one(sp.min)),
    maxCents: dollars(one(sp.max)),
    inStockOnly: one(sp.stock) === '1',
    sort: sort && (SORTS as readonly string[]).includes(sort) ? sort : undefined,
    page: Math.max(1, Math.min(10, Number(one(sp.page)) || 1)),
  };
}

export async function DealList({
  base,
  basePath,
  sp,
  categories,
  brands,
  hide = [],
  defaultSort = 'best',
  emptyTitle = 'No deals match these filters',
}: {
  base: FeedQuery;
  basePath: string;
  sp: SearchParams;
  categories: CategorySummary[];
  brands: BrandSummary[];
  hide?: ('category' | 'brand')[];
  defaultSort?: Sort;
  emptyTitle?: string;
}) {
  const f = parseFilters(sp);
  const { total, items } = await fetchDeals({
    ...base,
    category: base.category ?? f.category,
    brands: base.brand ? undefined : f.brands.length ? f.brands : undefined,
    kinds: f.kinds.length ? f.kinds : undefined,
    minCents: f.minCents,
    maxCents: f.maxCents,
    inStockOnly: f.inStockOnly,
    sort: f.sort ?? defaultSort,
    limit: PAGE * f.page,
  });

  const desktopId = `filters${basePath.replace(/\W+/g, '-')}`;
  const active: { label: string; href: string }[] = [];
  const without = (key: string, value?: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) for (const x of list(v)) if (k !== 'page' && !(k === key && (value == null || x === value))) q.append(k, x);
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  if (f.category && !hide.includes('category')) active.push({ label: categories.find((c) => c.slug === f.category)?.name ?? f.category, href: without('category') });
  for (const b of f.brands) if (!hide.includes('brand')) active.push({ label: brands.find((x) => x.slug === b)?.name ?? b, href: without('brand', b) });
  for (const k of f.kinds) active.push({ label: KINDS.find((x) => x.value === k)!.label, href: without('kind', k) });
  if (f.minCents != null) active.push({ label: `From $${f.minCents / 100}`, href: without('min') });
  if (f.maxCents != null) active.push({ label: `Up to $${f.maxCents / 100}`, href: without('max') });
  if (f.inStockOnly) active.push({ label: 'In stock', href: without('stock') });

  const panel = (formId: string) => (
    <form id={formId} className="filters" action={basePath} method="get" aria-label="Filters">
      <div className="head">
        <b>Filters</b>
        {active.length > 0 && <Link href={basePath}>Clear all</Link>}
      </div>
      {!hide.includes('category') && categories.length > 0 && (
        <fieldset>
          <legend>Category</legend>
          <label className="check-row">
            <input type="radio" name="category" value="" defaultChecked={!f.category} />
            <span>All</span>
          </label>
          {categories.map((c) => (
            <label key={c.slug} className="check-row">
              <input type="radio" name="category" value={c.slug} defaultChecked={f.category === c.slug} />
              <span>{c.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Deal type</legend>
        {KINDS.map((k) => (
          <label key={k.value} className="check-row">
            <input type="checkbox" name="kind" value={k.value} defaultChecked={f.kinds.includes(k.value)} />
            <span>{k.label}</span>
          </label>
        ))}
      </fieldset>
      {!hide.includes('brand') && brands.length > 0 && (
        <fieldset>
          <legend>Brand</legend>
          {brands.slice(0, 12).map((b) => (
            <label key={b.slug} className="check-row">
              <input type="checkbox" name="brand" value={b.slug} defaultChecked={f.brands.includes(b.slug)} />
              <span>{b.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Price</legend>
        <div className="price-inputs">
          <label className="sr-only" htmlFor={`${formId}-min`}>
            Minimum price in dollars
          </label>
          <input id={`${formId}-min`} type="number" name="min" min={0} step={1} inputMode="numeric" placeholder="$ Min" defaultValue={f.minCents != null ? f.minCents / 100 : ''} />
          <span className="muted">–</span>
          <label className="sr-only" htmlFor={`${formId}-max`}>
            Maximum price in dollars
          </label>
          <input id={`${formId}-max`} type="number" name="max" min={0} step={1} inputMode="numeric" placeholder="$ Max" defaultValue={f.maxCents != null ? f.maxCents / 100 : ''} />
        </div>
      </fieldset>
      <label className="check-row">
        <input type="checkbox" name="stock" value="1" defaultChecked={f.inStockOnly} />
        <span>In stock only</span>
      </label>
      {formId.endsWith('-m') && <input type="hidden" name="sort" defaultValue={f.sort ?? ''} />}
      <noscript>
        <button type="submit" className="btn btn-primary btn-sm">
          Apply
        </button>
      </noscript>
    </form>
  );

  return (
    <div className="list-layout">
      {panel(desktopId)}
      <div className="section" style={{ gap: 20 }}>
        <div className="toolbar">
          <div className="active-chips">
            <details className="filters-mobile">
              <summary className="chip">
                <Icon name="filter" size={14} stroke={2} />
                Filters{active.length ? ` (${active.length})` : ''}
              </summary>
              {panel(`${desktopId}-m`)}
            </details>
            {active.map((a) => (
              <Link key={a.href + a.label} href={a.href} className="chip on" aria-label={`Remove filter ${a.label}`}>
                {a.label}
                <Icon name="close" size={12} stroke={2.6} />
              </Link>
            ))}
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="muted num" style={{ fontSize: 14 }}>
              {total} {total === 1 ? 'deal' : 'deals'}
            </span>
            <label className="sr-only" htmlFor={`${desktopId}-sort`}>
              Sort
            </label>
            <select id={`${desktopId}-sort`} name="sort" form={desktopId} className="select" defaultValue={f.sort ?? defaultSort}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  Sort: {SORT_LABEL[s]}
                </option>
              ))}
            </select>
          </span>
        </div>
        {items.length ? (
          <div className="grid g4">
            {items.map((d, i) => (
              <DealCard key={d.id} deal={d} priority={i < 4} />
            ))}
          </div>
        ) : (
          <div className="empty">
            <h2>{emptyTitle}</h2>
            <p>Try removing a filter. New deals arrive through the day.</p>
            {active.length > 0 && (
              <Link href={basePath} className="btn btn-primary btn-sm">
                Clear filters
              </Link>
            )}
          </div>
        )}
        {items.length < total && (
          <Link className="btn btn-secondary more" href={`${basePath}?${new URLSearchParams([...Object.entries(sp).flatMap(([k, v]) => (k === 'page' ? [] : list(v).map((x) => [k, x] as [string, string]))), ['page', String(f.page + 1)]]).toString()}`} scroll={false}>
            Show more deals
          </Link>
        )}
      </div>
      <AutoSubmit formIds={[desktopId, `${desktopId}-m`]} />
    </div>
  );
}
