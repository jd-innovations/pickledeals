'use client';

// Apple MapKit JS for the website: loaded once, only when the site has a MapKit key (/api/mapkit-token).

declare global {
  interface Window {
    mapkit?: any;
  }
}

// The full build: the map and annotations are part of the script (the core build loads them separately).
const MAPKIT_SRC = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';

let loading: Promise<boolean> | null = null;

/** Loads MapKit JS once, if the site has a MapKit key; resolves false when it doesn't. */
export function loadMapKit(): Promise<boolean> {
  loading ??= fetch('/api/mapkit-token?check=1')
    .then((r) => (r.ok ? (r.json() as Promise<{ enabled: boolean }>) : { enabled: false }))
    .then(
    (r) =>
      r.enabled &&
      new Promise<boolean>((resolve) => {
        // data-callback runs once MapKit is ready. Reading mapkit.Map throws while its library is
        // missing, hence the try.
        (window as unknown as Record<string, () => void>).__pdMapKitReady = () => {
          const mk = window.mapkit;
          let ready = false;
          try {
            ready = typeof mk?.Map === 'function';
          } catch {
            ready = false;
          }
          if (!ready) return resolve(false);
          mk.init({
            authorizationCallback: (done: (t: string) => void) =>
              fetch('/api/mapkit-token')
                .then((t) => t.text())
                .then(done),
          });
          resolve(true);
        };
        const s = document.createElement('script');
        s.src = MAPKIT_SRC;
        s.crossOrigin = 'anonymous';
        s.async = true;
        s.dataset.callback = '__pdMapKitReady';
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      }),
    () => false,
  );
  return loading;
}

export const isDark = () =>
  document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
