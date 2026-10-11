'use client';

import { useState } from 'react';

import type { Art } from '@/lib/art';

import { ProductArt } from '../ProductArt';

export type GalleryImage = { src: string; cutout: boolean };

/** Product gallery: thumbnails beside the main image on desktop; the main image alone on phones. */
export function Gallery({ images, art, alt }: { images: GalleryImage[]; art: Art; alt: string }) {
  const [i, setI] = useState(0);
  const current = images[i];
  return (
    <div className="gallery">
      {images.length > 1 && (
        <div className="thumbs">
          {images.slice(0, 6).map((img, n) => (
            <button key={img.src} type="button" aria-label={`Image ${n + 1} of ${images.length}`} aria-pressed={n === i} onClick={() => setI(n)}>
              <span className="tile">
                <img className={img.cutout ? 'cutout' : 'photo'} src={img.src} alt="" loading="lazy" />
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="main">
        <div className="tile" role="img" aria-label={alt}>
          {current ? (
            <img className={current.cutout ? 'cutout' : 'photo'} src={current.src} alt="" fetchPriority="high" />
          ) : (
            <ProductArt {...art} />
          )}
        </div>
      </div>
    </div>
  );
}
