import { storageUrl } from '@/lib/urls';

/** A seller: their profile photo, or their initial on the neutral circle (same as the app). */
export function Avatar({ name, path, size = 48 }: { name: string; path: string | null; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, borderRadius: size / 2, fontSize: Math.round(size * 0.36), overflow: 'hidden' }} aria-hidden="true">
      {path ? <img src={storageUrl('avatars', path)} alt="" width={size} height={size} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}
