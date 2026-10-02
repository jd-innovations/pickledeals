import { IMAGE_SOURCES, type ImageSource } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { publicUrl, supabase } from '../lib/supabase';

type ImageRow = {
  id: string;
  storage_path: string;
  sort: number;
  is_cutout: boolean;
  source: ImageSource;
  source_url: string | null;
  license_note: string | null;
  rights_expires_at: string | null;
  status: 'active' | 'pending_review' | 'removed';
  width: number | null;
  height: number | null;
};

const SOURCE_LABEL: Record<ImageSource, string> = {
  brand_supplied: 'Brand supplied',
  manufacturer_site: 'Manufacturer site',
  retailer_feed: 'Retailer feed',
  affiliate_feed: 'Affiliate feed',
  owned: 'Owned (our photo)',
};

const ACCEPT = ['image/webp', 'image/png', 'image/jpeg'];

function dimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** D8: every catalog image records where it came from and under what terms we may show it. */
export function ProductImages({ productId }: { productId: string }) {
  const [images, setImages] = useState<ImageRow[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ImageSource>('brand_supplied');
  const [sourceUrl, setSourceUrl] = useState('');
  const [license, setLicense] = useState('');
  const [expires, setExpires] = useState('');
  const [cutout, setCutout] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('product_images')
      .select('id, storage_path, sort, is_cutout, source, source_url, license_note, rights_expires_at, status, width, height')
      .eq('product_id', productId)
      .order('sort');
    setImages((data as ImageRow[]) ?? []);
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);

  const needsProvenance = source !== 'owned' && !sourceUrl.trim() && !license.trim();

  const upload = async () => {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return setMessage({ error: true, text: 'Use a WebP, PNG or JPEG image.' });
    if (needsProvenance) return setMessage({ error: true, text: 'Add the source URL or a licence note for non-owned images.' });
    setBusy(true);
    setMessage(null);
    try {
      const { width, height } = await dimensions(file);
      const ext = file.type.split('/')[1]!.replace('jpeg', 'jpg');
      const path = `products/${productId}/${crypto.randomUUID()}.${ext}`;
      const { data: session } = await supabase.auth.getUser();
      const up = await supabase.storage.from('catalog').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      if (up.error) throw up.error;
      const { error } = await supabase.from('product_images').insert({
        product_id: productId,
        storage_path: path,
        sort: images.length,
        width,
        height,
        is_cutout: cutout,
        source,
        source_url: sourceUrl.trim() || null,
        license_note: license.trim() || null,
        rights_expires_at: expires ? new Date(expires).toISOString() : null,
        added_by: session.user?.id ?? null,
        status: 'active',
      });
      if (error) {
        await supabase.storage.from('catalog').remove([path]);
        throw error;
      }
      setFile(null);
      setSourceUrl('');
      setLicense('');
      setExpires('');
      setMessage({ error: false, text: 'Image added.' });
      await load();
    } catch (e) {
      setMessage({ error: true, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (img: ImageRow, status: ImageRow['status']) => {
    const { error } = await supabase.from('product_images').update({ status }).eq('id', img.id);
    if (error) setMessage({ error: true, text: error.message });
    await load();
  };

  const remove = async (img: ImageRow) => {
    if (!confirm('Delete this image permanently?')) return;
    const { error } = await supabase.from('product_images').delete().eq('id', img.id);
    if (error) return setMessage({ error: true, text: error.message });
    await supabase.storage.from('catalog').remove([img.storage_path]);
    await load();
  };

  return (
    <div className="card">
      <strong>Images</strong>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {images.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No images — the app shows placeholder art.
        </p>
      ) : (
        <table>
          <tbody>
            {images.map((img) => (
              <tr key={img.id}>
                <td style={{ width: 88 }}>
                  <img className="thumb" src={publicUrl('catalog', img.storage_path)} alt="" />
                </td>
                <td>
                  <div>
                    {SOURCE_LABEL[img.source]} {img.is_cutout && <span className="pill">cutout</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {img.source_url ?? img.license_note ?? '—'}
                    {img.rights_expires_at && ` · rights until ${new Date(img.rights_expires_at).toLocaleDateString()}`}
                    {img.width && ` · ${img.width}×${img.height}`}
                  </div>
                </td>
                <td>
                  <select value={img.status} onChange={(e) => setStatus(img, e.target.value as ImageRow['status'])}>
                    <option value="active">Active</option>
                    <option value="pending_review">Pending review</option>
                    <option value="removed">Removed</option>
                  </select>
                </td>
                <td>
                  <button type="button" className="btn danger" onClick={() => remove(img)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grid3">
        <label className="field">
          Image file (WebP, PNG or JPEG; ≤ 10 MB)
          <input type="file" accept={ACCEPT.join(',')} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="field">
          Source
          <select value={source} onChange={(e) => setSource(e.target.value as ImageSource)}>
            {IMAGE_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Rights expire (optional)
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
        <label className="field">
          Source URL
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://brand.com/press-kit" />
        </label>
        <label className="field">
          Licence note
          <input value={license} onChange={(e) => setLicense(e.target.value)} placeholder="Brand press kit, approved for retail use" />
        </label>
        <label className="field">
          Background
          <select value={cutout ? 'cutout' : 'photo'} onChange={(e) => setCutout(e.target.value === 'cutout')}>
            <option value="cutout">Cutout (transparent)</option>
            <option value="photo">Full photo</option>
          </select>
        </label>
      </div>
      <div className="row">
        <button type="button" className="btn primary" disabled={!file || busy || needsProvenance} onClick={upload}>
          {busy ? 'Uploading…' : 'Add image'}
        </button>
        {needsProvenance && file && <span className="muted">Non-owned images need a source URL or licence note (D8).</span>}
      </div>
    </div>
  );
}
