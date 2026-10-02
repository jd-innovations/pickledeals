import { slugify, SLUG_PATTERN } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { publicUrl, supabase } from '../lib/supabase';

type Brand = { id: string; slug: string; name: string; website_url: string | null; logo_path: string | null; is_active: boolean };

const LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/webp'];

export function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('brands').select('id, slug, name, website_url, logo_path, is_active').order('name');
    if (error) setMessage({ error: true, text: error.message });
    setBrands(data ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (b: Brand, isNew: boolean) => {
    const slug = isNew ? b.slug || slugify(b.name) : b.slug;
    if (!b.name.trim() || !SLUG_PATTERN.test(slug)) return setMessage({ error: true, text: 'Name and a valid slug are required.' });
    if (b.website_url && !b.website_url.startsWith('https://')) return setMessage({ error: true, text: 'Website must start with https://' });
    const values = { name: b.name.trim(), website_url: b.website_url?.trim() || null, is_active: b.is_active };
    const { error } = isNew ? await supabase.from('brands').insert({ ...values, slug }) : await supabase.from('brands').update(values).eq('id', b.id);
    if (error) return setMessage({ error: true, text: error.message });
    setMessage({ error: false, text: `Saved ${values.name}.` });
    setEditing(null);
    load();
  };

  const uploadLogo = async (b: Brand, file: File) => {
    if (!LOGO_TYPES.includes(file.type)) return setMessage({ error: true, text: 'Logos must be SVG, PNG or WebP.' });
    const path = `${b.id}.${file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1]}`;
    const up = await supabase.storage.from('brand-logos').upload(path, file, { upsert: true, contentType: file.type });
    if (up.error) return setMessage({ error: true, text: up.error.message });
    const { error } = await supabase.from('brands').update({ logo_path: path }).eq('id', b.id);
    if (error) return setMessage({ error: true, text: error.message });
    load();
  };

  return (
    <>
      <div className="row">
        <h1 className="grow">Brands</h1>
        <button className="btn primary" onClick={() => setEditing({ id: '', slug: '', name: '', website_url: '', logo_path: null, is_active: true })}>
          New brand
        </button>
      </div>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {editing && <BrandForm brand={editing} onCancel={() => setEditing(null)} onSave={(b) => save(b, !editing.id)} />}
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Logo</th>
            <th>Brand</th>
            <th>Website</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => (
            <tr key={b.id}>
              <td style={{ width: 88 }}>
                {b.logo_path ? <img className="thumb" style={{ width: 48, height: 48 }} src={publicUrl('brand-logos', b.logo_path)} alt="" /> : <span className="muted">—</span>}
              </td>
              <td>
                <strong>{b.name}</strong>
                <div className="muted" style={{ fontSize: 12 }}>
                  {b.slug}
                </div>
              </td>
              <td>{b.website_url ?? '—'}</td>
              <td>
                <span className={`pill ${b.is_active ? 'dark' : ''}`}>{b.is_active ? 'active' : 'hidden'}</span>
              </td>
              <td>
                <div className="row">
                  <button className="btn" onClick={() => setEditing(b)}>
                    Edit
                  </button>
                  <label className="btn" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Logo
                    <input type="file" accept={LOGO_TYPES.join(',')} hidden onChange={(e) => e.target.files?.[0] && uploadLogo(b, e.target.files[0])} />
                  </label>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function BrandForm({ brand, onSave, onCancel }: { brand: Brand; onSave: (b: Brand) => void; onCancel: () => void }) {
  const [b, setB] = useState(brand);
  const isNew = !brand.id;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="grid3">
        <label className="field">
          Name
          <input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} />
        </label>
        <label className="field">
          Slug {isNew ? '(auto)' : '(fixed)'}
          <input value={isNew ? b.slug || slugify(b.name) : b.slug} disabled={!isNew} onChange={(e) => setB({ ...b, slug: e.target.value })} />
        </label>
        <label className="field">
          Website
          <input value={b.website_url ?? ''} onChange={(e) => setB({ ...b, website_url: e.target.value })} placeholder="https://" />
        </label>
      </div>
      <div className="row">
        <label className="row">
          <input type="checkbox" checked={b.is_active} onChange={(e) => setB({ ...b, is_active: e.target.checked })} /> Visible in the app
        </label>
        <span className="grow" />
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onSave(b)}>
          Save
        </button>
      </div>
    </div>
  );
}
