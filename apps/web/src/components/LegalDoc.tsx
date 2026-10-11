import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Legal and help pages, moved from the old static site with their text unchanged (src/content/*.html).
 * Read at build time; the pages are static.
 */
export function LegalDoc({ name }: { name: 'privacy' | 'terms' | 'support' }) {
  const html = readFileSync(join(process.cwd(), 'src', 'content', `${name}.html`), 'utf8');
  return (
    <main className="page tight wrap">
      <article className="doc" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
