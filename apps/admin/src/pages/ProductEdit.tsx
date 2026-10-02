import { dollarsToCents, slugify, SLUG_PATTERN, type CatalogProduct } from '@pickledeals/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { go } from '../App';
import { supabase } from '../lib/supabase';
import { ProductImages } from './ProductImages';

type Option = { id: string; slug: string; name: string };
type VariantForm = { label: string; msrp: string; isDefault: boolean; attributes: string };
type Form = {
  slug: string;
  name: string;
  brand: string;
  category: string;
  modelYear: string;
  msrp: string;
  status: 'draft' | 'active' | 'discontinued';
  specs: string;
  aliases: string;
  variants: VariantForm[];
};

const EMPTY: Form = {
  slug: '',
  name: '',
  brand: '',
  category: '',
  modelYear: '',
  msrp: '',
  status: 'draft',
  specs: '',
  aliases: '',
  variants: [{ label: 'Standard', msrp: '', isDefault: true, attributes: '' }],
};

const pairs = (text: string) =>
  Object.fromEntries(
    text
      .split(/[\n;]/)
      .map((l) => l.split('='))
      .filter(([k, v]) => k?.trim() && v?.trim())
      .map(([k, v]) => [k!.trim(), v!.trim()]),
  );
const unpairs = (o: Record<string, unknown>) =>
  Object.entries(o)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('\n');
const cents = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2));

export function ProductEditPage({ slug }: { slug: string | null }) {
  const [brands, setBrands] = useState<Option[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [productId, setProductId] = useState<string | null>(null);
  const [existingLabels, setExistingLabels] = useState<string[]>([]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = slug === null;

  useEffect(() => {
    supabase.from('brands').select('id, slug, name').order('name').then(({ data }) => setBrands(data ?? []));
    supabase.from('categories').select('id, slug, name').order('sort').then(({ data }) => setCategories(data ?? []));
  }, []);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from('products')
      .select('id, slug, name, model_year, msrp_cents, status, specs, brand:brands(slug), category:categories(slug), aliases:product_aliases(alias), variants:product_variants(label, msrp_cents, is_default, attributes, sort)')
      .eq('slug', slug)
      .single()
      .then(({ data, error }) => {
        if (error || !data) return setMessage({ error: true, text: error?.message ?? 'Not found' });
        const d = data as unknown as {
          id: string;
          slug: string;
          name: string;
          model_year: number | null;
          msrp_cents: number | null;
          status: Form['status'];
          specs: Record<string, unknown>;
          brand: { slug: string };
          category: { slug: string };
          aliases: { alias: string }[];
          variants: { label: string; msrp_cents: number | null; is_default: boolean; attributes: Record<string, unknown>; sort: number }[];
        };
        const variants = [...d.variants].sort((a, b) => a.sort - b.sort);
        setProductId(d.id);
        setExistingLabels(variants.map((v) => v.label));
        setForm({
          slug: d.slug,
          name: d.name,
          brand: d.brand.slug,
          category: d.category.slug,
          modelYear: d.model_year ? String(d.model_year) : '',
          msrp: cents(d.msrp_cents),
          status: d.status,
          specs: unpairs(d.specs),
          aliases: d.aliases.map((a) => a.alias).join(', '),
          variants: variants.map((v) => ({ label: v.label, msrp: cents(v.msrp_cents), isDefault: v.is_default, attributes: unpairs(v.attributes) })),
        });
      });
  }, [slug]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setVariant = (i: number, patch: Partial<VariantForm>) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : patch.isDefault ? { ...v, isDefault: false } : v)),
    }));

  // New products get a slug from brand + name until the slug is edited by hand.
  const autoSlug = slugify(`${form.brand} ${form.name}`);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const productSlug = isNew ? form.slug || autoSlug : form.slug;
    const problems: string[] = [];
    if (!SLUG_PATTERN.test(productSlug)) problems.push('Slug must be lowercase words joined by hyphens.');
    if (!form.name.trim() || !form.brand || !form.category) problems.push('Name, brand and category are required.');
    const msrp = form.msrp ? dollarsToCents(form.msrp) : undefined;
    if (msrp === null) problems.push('MSRP must be a dollar amount like 279.95.');
    const variants = form.variants.map((v) => ({ ...v, label: v.label.trim(), cents: v.msrp ? dollarsToCents(v.msrp) : undefined }));
    if (variants.length === 0 || variants.some((v) => !v.label)) problems.push('Every variant needs a label.');
    if (new Set(variants.map((v) => v.label)).size !== variants.length) problems.push('Variant labels must be unique.');
    if (variants.some((v) => v.cents === null)) problems.push('Variant MSRPs must be dollar amounts.');
    if (problems.length) return setMessage({ error: true, text: problems.join(' ') });

    const product: CatalogProduct = {
      slug: productSlug,
      name: form.name.trim(),
      brand_slug: form.brand,
      category_slug: form.category,
      model_year: form.modelYear ? Number(form.modelYear) : undefined,
      msrp_cents: msrp ?? undefined,
      status: form.status,
      specs: pairs(form.specs),
      aliases: form.aliases.split(',').map((a) => a.trim()).filter(Boolean),
      variants: variants.map((v) => ({ label: v.label, msrp_cents: v.cents ?? undefined, is_default: v.isDefault, attributes: pairs(v.attributes), identifiers: [] })),
    };

    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.rpc('import_catalog', { payload: { products: [product] } as never, dry_run: false });
    const report = data as { applied: boolean; errors: { message: string }[] } | null;
    if (error || !report?.applied) {
      setBusy(false);
      return setMessage({ error: true, text: error?.message ?? report?.errors.map((x) => x.message).join('; ') ?? 'Save failed' });
    }
    // The importer upserts variants by label; remove the ones deleted in this form.
    const removed = existingLabels.filter((l) => !variants.some((v) => v.label === l));
    if (removed.length && productId) {
      const { error: delError } = await supabase.from('product_variants').delete().eq('product_id', productId).in('label', removed);
      if (delError) {
        setBusy(false);
        return setMessage({ error: true, text: `Saved, but couldn’t remove variants: ${delError.message}` });
      }
    }
    setBusy(false);
    setMessage({ error: false, text: 'Saved.' });
    if (isNew) go(`products/${productSlug}`);
    else setExistingLabels(variants.map((v) => v.label));
  };

  return (
    <form onSubmit={save} style={{ display: 'grid', gap: 16 }}>
      <div className="row">
        <a href="#/products" className="muted">
          ← Products
        </a>
      </div>
      <div className="row">
        <h1 className="grow">{isNew ? 'New product' : form.name || slug}</h1>
        <button className="btn primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}

      <div className="card">
        <div className="grid3">
          <label className="field">
            Brand
            <select value={form.brand} onChange={(e) => set('brand', e.target.value)}>
              <option value="">Choose…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Name (without brand)
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Perseus Pro IV" />
          </label>
          <label className="field">
            Category
            <select value={form.category} onChange={(e) => set('category', e.target.value)}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Slug {isNew ? '(auto from brand + name)' : '(fixed)'}
            <input value={isNew ? form.slug || autoSlug : form.slug} disabled={!isNew} onChange={(e) => set('slug', e.target.value)} />
          </label>
          <label className="field">
            MSRP (USD)
            <input className="num" value={form.msrp} onChange={(e) => set('msrp', e.target.value)} placeholder="279.95" />
          </label>
          <label className="field">
            Status
            <select value={form.status} onChange={(e) => set('status', e.target.value as Form['status'])}>
              <option value="draft">Draft (hidden)</option>
              <option value="active">Active</option>
              <option value="discontinued">Discontinued</option>
            </select>
          </label>
          <label className="field">
            Model year
            <input className="num" value={form.modelYear} onChange={(e) => set('modelYear', e.target.value.replace(/\D/g, ''))} placeholder="2025" />
          </label>
          <label className="field" style={{ gridColumn: 'span 2' }}>
            Search aliases (comma-separated)
            <input value={form.aliases} onChange={(e) => set('aliases', e.target.value)} placeholder="perseus 4, pro iv" />
          </label>
        </div>
        <label className="field">
          Specs (one key=value per line)
          <textarea value={form.specs} onChange={(e) => set('specs', e.target.value)} placeholder={'core=polypropylene\nweight_oz=8.0'} />
        </label>
      </div>

      <div className="card">
        <div className="row">
          <strong className="grow">Variants</strong>
          <button type="button" className="btn" onClick={() => set('variants', [...form.variants, { label: '', msrp: '', isDefault: false, attributes: '' }])}>
            Add variant
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Default</th>
              <th>Label</th>
              <th>MSRP override</th>
              <th>Attributes (key=value; …)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {form.variants.map((v, i) => (
              <tr key={i}>
                <td>
                  <input type="radio" name="default" checked={v.isDefault} onChange={() => setVariant(i, { isDefault: true })} />
                </td>
                <td>
                  <input value={v.label} onChange={(e) => setVariant(i, { label: e.target.value })} placeholder="16mm" />
                </td>
                <td>
                  <input className="num" value={v.msrp} onChange={(e) => setVariant(i, { msrp: e.target.value })} placeholder="—" />
                </td>
                <td>
                  <input value={v.attributes} onChange={(e) => setVariant(i, { attributes: e.target.value })} placeholder="thickness_mm=16" />
                </td>
                <td>
                  <button type="button" className="btn danger" disabled={form.variants.length === 1} onClick={() => set('variants', form.variants.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {productId ? <ProductImages productId={productId} /> : <p className="muted">Save the product to add images.</p>}
    </form>
  );
}
