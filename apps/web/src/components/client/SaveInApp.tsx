'use client';

import { appRouteForLink } from '@pickledeals/shared';
import qrcode from 'qrcode-generator';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { Icon } from '../Icon';

/**
 * "Save this in the app" (approved: the ♡, Price alert and Follow buttons stay visible on the website
 * and explain that saves, alerts and chat live in the app). Desktop shows a QR code that opens the
 * same page on an iPhone; phones get a sheet with "Open in the app".
 */
type Ask = { title: string; path: string; action: 'save' | 'alert' | 'follow' | 'message' | 'offer' };

const COPY: Record<Ask['action'], { title: string; lede: string }> = {
  save: { title: 'Save this in the app', lede: 'Saves, price alerts and pre-owned chat live in the PickleDeals app, so they follow you and can notify you.' },
  alert: { title: 'Set a price alert in the app', lede: 'The app tells you when this drops to your target price, even when you’re not looking.' },
  follow: { title: 'Follow in the app', lede: 'Follow brands in the PickleDeals app to hear about their new deals.' },
  message: { title: 'Message the seller in the app', lede: 'Chat, offers and meet-up spots happen in the PickleDeals app, so your contact details stay private.' },
  offer: { title: 'Make an offer in the app', lede: 'Offers, counteroffers and chat happen in the PickleDeals app.' },
};

const Ctx = createContext<(ask: Ask) => void>(() => {});
export const useSaveInApp = () => useContext(Ctx);

export function SaveInAppProvider({ siteUrl, children }: { siteUrl: string; children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const open = useCallback((a: Ask) => setAsk(a), []);
  return (
    <Ctx.Provider value={open}>
      {children}
      {ask && <SaveDialog ask={ask} siteUrl={siteUrl} onClose={() => setAsk(null)} />}
    </Ctx.Provider>
  );
}

function SaveDialog({ ask, siteUrl, onClose }: { ask: Ask; siteUrl: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const url = `${siteUrl}${ask.path}`;
  const appUrl = `pickledeals:/${appRouteForLink(ask.path) ?? '/'}`;
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [url]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [onClose]);

  const copy = COPY[ask.action];
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog small" role="dialog" aria-modal="true" aria-labelledby="save-in-app-title" tabIndex={-1} ref={ref}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="sheet-grabber" aria-hidden="true" />
          <div className="app-id">
            <span className="icon">PD</span>
            <div>
              <small>PickleDeals for iPhone</small>
              <h2 id="save-in-app-title">{copy.title}</h2>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>
            {copy.lede}
          </p>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{ask.title}</p>
          <ul className="perks">
            <li>Save products, deals and listings</li>
            <li>Price alerts when your target is hit</li>
            <li>Message sellers and make offers</li>
          </ul>
          <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <a className="btn btn-primary btn-sm mobile-only" href={appUrl}>
              Open in the app
            </a>
            <a className="btn btn-primary btn-sm desktop-only" href="/app">
              Get the app
            </a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Not now
            </button>
          </div>
        </div>
        <div className="qr-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div className="qr" role="img" aria-label="QR code that opens this page in the PickleDeals app" dangerouslySetInnerHTML={{ __html: svg }} />
          <span className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
            Scan with your iPhone camera to open this in the app
          </span>
        </div>
      </div>
    </div>
  );
}

/** The ♡ on cards and detail pages. */
export function SaveButton({ title, path, className = 'fav-btn glass', size = 18, action = 'save', label }: { title: string; path: string; className?: string; size?: number; action?: Ask['action']; label?: string }) {
  const open = useSaveInApp();
  return (
    <button
      type="button"
      className={className}
      aria-label={label ?? (action === 'alert' ? 'Price alert (in the app)' : 'Save (in the app)')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open({ title, path, action });
      }}>
      <Icon name={action === 'alert' ? 'bell' : 'heart'} size={size} />
    </button>
  );
}

/** Text buttons that open the same dialog ("Message seller in the app", "Follow in the app"). */
export function InAppButton({ title, path, action, className, style, children }: { title: string; path: string; action: Ask['action']; className: string; style?: CSSProperties; children: ReactNode }) {
  const open = useSaveInApp();
  return (
    <button type="button" className={className} style={style} onClick={() => open({ title, path, action })}>
      {children}
    </button>
  );
}
