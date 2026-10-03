import { slugify, SLUG_PATTERN } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

type Retailer = {
  id: string;
  slug: string;
  name: string;
  kind: 'marketplace' | 'retailer' | 'manufacturer';
  domain: string;
  price_display_default: 'show' | 'check_price';
  is_active: boolean;
};
type Affiliate = { retailer_id: string; network: string; tag_template: string | null; link_template: string | null; is_active: boolean };

const EMPTY: Retailer = { id: '', slug: '', name: '', kind: 'retailer', domain: '', price_display_default: 'show', is_active: true };

/**
 * Retailers. "Check price" retailers (D1) never show a number in the app; only an approved API
 * source can change that. Affiliate programs are admin-only and never affect ranking: a query tag
 * (Amazon: tag=…) and/or a network click URL with {url} (AvantLink, Impact, CJ) applied by the go function.
 */
export function RetailersPage({ role }: { role: 'admin' | 'editor' }) {
  const [rows, setRows] = useState<Retailer[]>([]);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [editing, setEditing] = useState<Retailer | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('retailers').select('id, slug, name, kind, domain, price_display_default, is_active').order('name');
    if (error) setMessage({ error: true, text: error.message });
    setRows(data ?? []);
    if (role === 'admin') {
      const { data: aff } = await supabase.from('affiliate_programs').select('retailer_id, network, tag_template, link_template, is_active');
      setAffiliates(aff ?? []);
    }
  }, [role]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async (r: Retailer) => {
    const isNew = !r.id;
    const slug = isNew ? r.slug || slugify(r.name) : r.slug;
    const domain = r.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!r.name.trim() || !SLUG_PATTERN.test(slug) || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return setMessage({ error: true, text: 'Name, slug and a domain like joola.com are required.' });
    const values = { name: r.name.trim(), kind: r.kind, domain, price_display_default: r.price_display_default, is_active: r.is_active };
    const { error } = isNew ? await supabase.from('retailers').insert({ ...values, slug }) : await supabase.from('retailers').update(values).eq('id', r.id);
    setMessage(error ? { error: true, text: error.message } : { error: false, text: `Saved ${values.name}.` });
    if (!error) setEditing(null);
    load();
  };

  const saveAffiliate = async (retailerId: string, network: string, tag: string, link: string) => {
    const { error } = await supabase
      .from('affiliate_programs')
      .upsert({ retailer_id: retailerId, network, tag_template: tag || null, link_template: link || null, is_active: true }, { onConflict: 'retailer_id' });
    const hint = error?.message.includes('link_template')
      ? 'Click URL must be https and contain {url}, e.g. https://www.avantlink.com/click.php?tt=cl&mi=…&pw=…&url={url}'
      : 'Tag must be query parameters like tag=pickledeals-20';
    setMessage(error ? { error: true, text: error.message.includes('check') ? hint : error.message } : { error: false, text: 'Affiliate program saved.' });
    load();
  };

  return (
    <>
      <div className="row">
        <h1 className="grow">Retailers</h1>
        <button className="btn primary" onClick={() => setEditing(EMPTY)}>
          New retailer
        </button>
      </div>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {editing && <RetailerForm retailer={editing} onSave={save} onCancel={() => setEditing(null)} />}
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Retailer</th>
            <th>Kind</th>
            <th>Domain</th>
            <th>Prices</th>
            {role === 'admin' && <th>Affiliate link (admin)</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const aff = affiliates.find((a) => a.retailer_id === r.id);
            return (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.slug}
                    {r.is_active ? '' : ' · hidden'}
                  </div>
                </td>
                <td>{r.kind}</td>
                <td>{r.domain}</td>
                <td>
                  <span className={`pill ${r.price_display_default === 'show' ? 'dark' : ''}`}>{r.price_display_default === 'show' ? 'show' : 'check price'}</span>
                </td>
                {role === 'admin' && (
                  <td>
                    <AffiliateEditor current={aff} onSave={(network, tag, link) => saveAffiliate(r.id, network, tag, link)} />
                  </td>
                )}
                <td>
                  <button className="btn" onClick={() => setEditing(r)}>
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function AffiliateEditor({ current, onSave }: { current?: Affiliate; onSave: (network: string, tag: string, link: string) => void }) {
  const [network, setNetwork] = useState(current?.network ?? '');
  const [tag, setTag] = useState(current?.tag_template ?? '');
  const [link, setLink] = useState(current?.link_template ?? '');
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div className="row">
        <input style={{ width: 100 }} placeholder="network" value={network} onChange={(e) => setNetwork(e.target.value)} />
        <input style={{ width: 170 }} placeholder="tag=pickledeals-20" value={tag} onChange={(e) => setTag(e.target.value.trim())} />
        <button className="btn" disabled={!network || (!tag && !link)} onClick={() => onSave(network, tag, link)}>
          Save
        </button>
      </div>
      <input placeholder="or click URL: https://www.avantlink.com/click.php?tt=cl&mi=…&pw=…&url={url}" value={link} onChange={(e) => setLink(e.target.value.trim())} />
    </div>
  );
}

function RetailerForm({ retailer, onSave, onCancel }: { retailer: Retailer; onSave: (r: Retailer) => void; onCancel: () => void }) {
  const [r, setR] = useState(retailer);
  const isNew = !retailer.id;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="grid3">
        <label className="field">
          Name
          <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
        </label>
        <label className="field">
          Slug {isNew ? '(auto)' : '(fixed)'}
          <input value={isNew ? r.slug || slugify(r.name) : r.slug} disabled={!isNew} onChange={(e) => setR({ ...r, slug: e.target.value })} />
        </label>
        <label className="field">
          Domain (offer URLs must be on it)
          <input value={r.domain} onChange={(e) => setR({ ...r, domain: e.target.value })} placeholder="joola.com" />
        </label>
        <label className="field">
          Kind
          <select value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as Retailer['kind'] })}>
            <option value="retailer">Retailer</option>
            <option value="manufacturer">Manufacturer</option>
            <option value="marketplace">Marketplace</option>
          </select>
        </label>
        <label className="field">
          Prices in the app
          <select value={r.price_display_default} onChange={(e) => setR({ ...r, price_display_default: e.target.value as Retailer['price_display_default'] })}>
            <option value="show">Show prices</option>
            <option value="check_price">Check price (no number, D1)</option>
          </select>
        </label>
        <label className="row" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={r.is_active} onChange={(e) => setR({ ...r, is_active: e.target.checked })} /> Visible in the app
        </label>
      </div>
      <div className="row">
        <span className="grow" />
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={() => onSave(r)}>
          Save
        </button>
      </div>
    </div>
  );
}
