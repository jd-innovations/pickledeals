import { slugify, SLUG_PATTERN } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

type Category = { id: string; slug: string; name: string; sort: number; variant_axes: string[]; is_active: boolean };

export function CategoriesPage() {
  const [rows, setRows] = useState<Category[]>([]);
  const [draft, setDraft] = useState({ name: '', slug: '' });
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('id, slug, name, sort, variant_axes, is_active').order('sort');
    if (error) setMessage({ error: true, text: error.message });
    setRows(data ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const update = async (c: Category, patch: Partial<Category>) => {
    const { error } = await supabase.from('categories').update(patch).eq('id', c.id);
    setMessage(error ? { error: true, text: error.message } : { error: false, text: `Saved ${patch.name ?? c.name}.` });
    load();
  };

  const create = async () => {
    const slug = draft.slug || slugify(draft.name);
    if (!draft.name.trim() || !SLUG_PATTERN.test(slug)) return setMessage({ error: true, text: 'Name and a valid slug are required.' });
    const sort = Math.max(0, ...rows.map((r) => r.sort)) + 1;
    const { error } = await supabase.from('categories').insert({ name: draft.name.trim(), slug, sort });
    setMessage(error ? { error: true, text: error.message } : { error: false, text: `Created ${draft.name}.` });
    if (!error) setDraft({ name: '', slug: '' });
    load();
  };

  return (
    <>
      <h1>Categories</h1>
      <p className="muted">Variant axes declare which attributes create variants (paddles: thickness). Shoe size is never a variant.</p>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      <table>
        <thead>
          <tr>
            <th>Sort</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Variant axes</th>
            <th>Visible</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td style={{ width: 80 }}>
                <input className="num" style={{ width: 60 }} defaultValue={c.sort} onBlur={(e) => Number(e.target.value) !== c.sort && update(c, { sort: Number(e.target.value) || 0 })} />
              </td>
              <td>
                <input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && update(c, { name: e.target.value.trim() })} />
              </td>
              <td className="muted">{c.slug}</td>
              <td>
                <input
                  defaultValue={c.variant_axes.join(', ')}
                  placeholder="thickness"
                  onBlur={(e) => {
                    const axes = e.target.value.split(',').map((a) => a.trim()).filter(Boolean);
                    if (axes.join(',') !== c.variant_axes.join(',')) update(c, { variant_axes: axes });
                  }}
                />
              </td>
              <td>
                <input type="checkbox" checked={c.is_active} onChange={(e) => update(c, { is_active: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>New category</h2>
      <div className="row">
        <input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <input placeholder={slugify(draft.name) || 'slug'} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
        <button className="btn primary" onClick={create}>
          Create
        </button>
      </div>
    </>
  );
}
