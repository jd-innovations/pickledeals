import { formatPrice } from '@pickledeals/shared';
import { useEffect, useState } from 'react';

import { go } from '../App';
import { supabase } from '../lib/supabase';

type Row = {
  id: string;
  slug: string;
  name: string;
  status: string;
  msrp_cents: number | null;
  brand: { name: string } | null;
  category: { name: string } | null;
  variants: { count: number }[];
  images: { count: number }[];
};

export function ProductsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      let query = supabase
        .from('products')
        .select('id, slug, name, status, msrp_cents, brand:brands(name), category:categories(name), variants:product_variants(count), images:product_images(count)')
        .order('name')
        .limit(500);
      if (q.trim()) query = query.or(`name.ilike.%${q.trim().replace(/[%,()]/g, '')}%,slug.ilike.%${q.trim().replace(/[%,()]/g, '')}%`);
      if (status) query = query.eq('status', status as 'draft' | 'active' | 'discontinued');
      const { data, error } = await query.returns<Row[]>();
      if (cancelled) return;
      setError(error?.message ?? null);
      setRows(data ?? []);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, status]);

  return (
    <>
      <div className="row">
        <h1 className="grow">Products</h1>
        <button className="btn primary" onClick={() => go('products/new')}>
          New product
        </button>
      </div>
      <div className="row" style={{ margin: '12px 0' }}>
        <input className="grow" placeholder="Search name or slug" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="discontinued">Discontinued</option>
        </select>
      </div>
      {error && <div className="notice error">{error}</div>}
      {rows && (
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Brand</th>
              <th>Category</th>
              <th>Status</th>
              <th>Variants</th>
              <th>Images</th>
              <th>MSRP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="link" onClick={() => go(`products/${r.slug}`)}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.slug}
                  </div>
                </td>
                <td>{r.brand?.name}</td>
                <td>{r.category?.name}</td>
                <td>
                  <span className={`pill ${r.status === 'active' ? 'dark' : ''}`}>{r.status}</span>
                </td>
                <td className="num">{r.variants[0]?.count ?? 0}</td>
                <td className="num">{r.images[0]?.count ?? 0}</td>
                <td className="num">{r.msrp_cents != null ? formatPrice(r.msrp_cents) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows && <p className="muted">{rows.length} shown</p>}
    </>
  );
}
