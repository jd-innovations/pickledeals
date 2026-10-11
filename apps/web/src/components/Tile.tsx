import type { ReactNode } from 'react';

import type { CatalogImage } from '@/data/catalog';
import { productArt } from '@/lib/art';
import { storageUrl } from '@/lib/urls';

import { ProductArt } from './ProductArt';

/**
 * Neutral image tile. Cutouts sit inset on the tile; photographs fill it (D8). Products without a
 * licensed image show the same placeholder art as the app.
 */
export function ProductTile({
  image,
  productSlug,
  categorySlug,
  alt,
  priority,
  children,
  className,
}: {
  image: CatalogImage | null;
  productSlug: string;
  categorySlug: string;
  alt: string;
  priority?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`tile${className ? ` ${className}` : ''}`} role="img" aria-label={alt}>
      {image ? (
        <img
          className={image.isCutout ? 'cutout' : 'photo'}
          src={storageUrl('catalog', image.path)}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : (
        <ProductArt {...productArt(productSlug, categorySlug)} />
      )}
      {children}
    </div>
  );
}

/** Listing photos are seller photographs: they fill the tile. */
export function ListingTile({ path, categorySlug, seed, alt, children }: { path: string | null; categorySlug: string; seed: string; alt: string; children?: ReactNode }) {
  return (
    <div className="tile" role="img" aria-label={alt}>
      {path ? (
        <img className="photo" src={storageUrl('listing-images', path)} alt="" loading="lazy" decoding="async" />
      ) : (
        <ProductArt {...productArt(seed, categorySlug)} />
      )}
      {children}
    </div>
  );
}
