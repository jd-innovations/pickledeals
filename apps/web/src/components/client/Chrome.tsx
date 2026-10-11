'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Icon, ThemeGlyph } from '../Icon';

type Theme = 'system' | 'light' | 'dark';

function readTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'system';
}

function applyTheme(t: Theme) {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try {
    if (t === 'system') localStorage.removeItem('pd-theme');
    else localStorage.setItem('pd-theme', t);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
  window.dispatchEvent(new Event('pd-theme'));
}

function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => {
    setTheme(readTheme());
    const on = () => setTheme(readTheme());
    window.addEventListener('pd-theme', on);
    return () => window.removeEventListener('pd-theme', on);
  }, []);
  return [theme, applyTheme];
}

const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

/** Header button: cycles System → Light → Dark. */
export function ThemeButton() {
  const [theme, setTheme] = useTheme();
  return (
    <button type="button" className="icon-btn" aria-label={`Appearance: ${LABEL[theme]}. Change`} title={`Appearance: ${LABEL[theme]}`} onClick={() => setTheme(NEXT[theme])}>
      <ThemeGlyph />
    </button>
  );
}

/** Footer segmented control (System / Light / Dark), like the app's Appearance setting. */
export function ThemeSwitch() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="seg" role="radiogroup" aria-label="Appearance">
      {(['system', 'light', 'dark'] as const).map((t) => (
        <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}>
          {LABEL[t]}
        </button>
      ))}
    </div>
  );
}

/** Header search. "/" focuses it from anywhere, like the mockup's hint. */
export function SearchBox({ initial = '' }: { initial?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <form className="search" role="search" action="/search" method="get">
      <Icon name="search" size={18} stroke={2} />
      <label htmlFor="site-search" className="sr-only">
        Search PickleDeals
      </label>
      <input ref={ref} id="site-search" name="q" type="search" defaultValue={initial} placeholder="Search paddles, shoes, brands" autoComplete="off" enterKeyHint="search" />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}

const TABS = [
  { href: '/', label: 'Today’s deals', match: (p: string) => p === '/' },
  { href: '/deals/price-drops', label: 'Price drops', match: (p: string) => p.startsWith('/deals/price-drops') },
  { href: '/promo-codes', label: 'Promo codes', match: (p: string) => p.startsWith('/promo-codes') || p.startsWith('/deals/promo-codes') },
  { href: '/deals/ending-soon', label: 'Ending soon', match: (p: string) => p.startsWith('/deals/ending-soon') },
  { href: '/categories', label: 'Categories', match: (p: string) => p.startsWith('/categor') },
  { href: '/brands', label: 'Brands', match: (p: string) => p.startsWith('/brand') },
  { href: '/marketplace', label: 'Pre-owned', match: (p: string) => p.startsWith('/marketplace') || p.startsWith('/listing') || p.startsWith('/seller') },
];

export function SectionTabs() {
  const path = usePathname();
  return (
    <nav className="section-tabs wrap noscroll" aria-label="Sections">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(path) ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone tab bar (approved): Deals · Pre-owned · Search · Get app. */
export function TabBar() {
  const path = usePathname();
  const router = useRouter();
  const market = path.startsWith('/marketplace') || path.startsWith('/listing') || path.startsWith('/seller');
  const search = path.startsWith('/search');
  return (
    <nav className="tabbar glass mobile-only" aria-label="Primary">
      <Link href="/" aria-current={!market && !search ? 'page' : undefined}>
        <Icon name="tag" size={22} />
        Deals
      </Link>
      <Link href="/marketplace" aria-current={market ? 'page' : undefined}>
        <Icon name="store" size={22} />
        Pre-owned
      </Link>
      <Link
        href="/search"
        aria-current={search ? 'page' : undefined}
        onClick={(e) => {
          const input = document.getElementById('site-search') as HTMLInputElement | null;
          if (input && !search) {
            e.preventDefault();
            input.focus();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (!input) router.push('/search');
        }}>
        <Icon name="search" size={22} />
        Search
      </Link>
      <Link href="/app" className="get">
        <Icon name="phone" size={22} />
        Get app
      </Link>
    </nav>
  );
}

/**
 * Submits a filter form whenever one of its controls changes (including controls tied to it with the
 * `form` attribute, like the sort menu), so the list updates without an Apply button.
 */
export function AutoSubmit({ formIds }: { formIds: string[] }) {
  const key = formIds.join(',');
  useEffect(() => {
    const ids = key.split(',');
    let t: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      const form = el.form;
      if (!form || !ids.includes(form.id)) return;
      // The sort menu belongs to the desktop form; on phones the sheet's form carries the other filters.
      if (el.name === 'sort') {
        const phone = document.getElementById(ids[1] ?? '') as HTMLFormElement | null;
        if (phone && phone.offsetParent !== null) {
          const hidden = phone.querySelector<HTMLInputElement>('input[name="sort"]');
          if (hidden) hidden.value = el.value;
          phone.requestSubmit();
          return;
        }
      }
      clearTimeout(t);
      t = setTimeout(() => form.requestSubmit(), el.type === 'number' ? 600 : 0);
    };
    document.addEventListener('change', on);
    return () => document.removeEventListener('change', on);
  }, [key]);
  return null;
}

/** Closes an intercepted deal pop-up by going back, so the list keeps its scroll position. */
export function ModalFrame({ children, label }: { children: React.ReactNode; label: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && router.back();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && router.back()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        {children}
      </div>
    </div>
  );
}

export function CloseModalButton() {
  const router = useRouter();
  return (
    <button type="button" className="icon-btn surface" aria-label="Close" onClick={() => router.back()}>
      <Icon name="close" size={16} stroke={2.4} />
    </button>
  );
}
