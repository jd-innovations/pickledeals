import { palette } from '@pickledeals/shared';

/**
 * CSS custom properties generated from the shared design tokens (packages/shared/src/tokens.ts, ported
 * 1:1 from preview/pd.css), so the website and the app can never drift. Three states, like the app:
 * System (no attribute, follows prefers-color-scheme), Light and Dark (data-theme on <html>).
 */
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function vars(scheme: 'light' | 'dark'): string {
  return Object.entries(palette[scheme])
    .map(([k, v]) => `--${kebab(k)}:${v}`)
    .join(';');
}

export const THEME_CSS = [
  `:root{${vars('light')};color-scheme:light}`,
  `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars('dark')};color-scheme:dark}}`,
  `:root[data-theme="dark"]{${vars('dark')};color-scheme:dark}`,
].join('\n');

/** Runs before first paint so a saved Light/Dark choice never flashes the other theme. */
export const THEME_BOOT = `try{var t=localStorage.getItem('pd-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
