import { formatAgo } from '@pickledeals/shared';
import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

type Link = { content_source_id: string | null; content_ref: string | null; content_synced_at: string | null };
type StoreOffer = { id: string; content_ref: string; status: string; source_id: string | null; retailer: { name: string } | null };

/**
 * Where this product's description and images come from. Products created from a store item, or with
 * no content of their own, follow that store automatically; this panel shows the link and lets staff
 * switch a product (e.g. one with curated images) to a store's content.
 */
export function StoreContentPanel({ productId }: { productId: string }) {
  const [link, setLink] = useState<Link | null>(null);
  const [offers, setOffers] = useState<StoreOffer[]>([]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [p, o] = await Promise.all([
      supabase.from('products').select('content_source_id, content_ref, content_synced_at').eq('id', productId).single<Link>(),
      supabase
        .from('retailer_offers')
        .select('id, content_ref, status, source_id, retailer:retailers(name), variant:product_variants!inner(product_id)')
        .eq('variant.product_id', productId)
        .not('content_ref', 'is', null)
        .returns<StoreOffer[]>(),
    ]);
    setLink(p.data ?? null);
    setOffers(o.data ?? []);
  }, [productId]);
  useEffect(() => {
    load();
  }, [load]);

  const use = async (o: StoreOffer) => {
    const { error } = await supabase.rpc('staff_use_store_content', { product: productId, offer: o.id });
    setMessage(
      error
        ? { error: true, text: error.message }
        : {
            error: false,
            text: `This product now follows ${o.retailer?.name ?? 'the store'}. Description and images arrive with its next run (within minutes).`,
          },
    );
    load();
  };

  if (!link) return null;
  const current = offers.find((o) => o.content_ref === link.content_ref && o.source_id === link.content_source_id);
  return (
    <div className="card">
      <strong>Store content</strong>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {link.content_ref
          ? `Description, images and (while empty) specs follow ${current?.retailer?.name ?? 'a connected store'}${
              link.content_synced_at ? `; last synced ${formatAgo(link.content_synced_at)}` : '; waiting for the next run'
            }. Edit them in the store; changes arrive within 30 minutes.`
          : offers.length
            ? 'Not following a store. Products without a description or images pick up their store’s content automatically; this one has its own.'
            : 'No connected store sells this product yet.'}
      </p>
      {message && <div className={`notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {offers
        .filter((o) => o !== current)
        .map((o) => (
          <div key={o.id} className="row">
            <span className="grow" style={{ fontSize: 13 }}>
              {o.retailer?.name} <span className="muted">({o.status})</span>
            </span>
            <button type="button" className="btn" onClick={() => use(o)}>
              Use this store’s description and images
            </button>
          </div>
        ))}
    </div>
  );
}
