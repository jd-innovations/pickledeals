import { buildCatalogPayload, type CatalogIssue, type CatalogPayload } from '@pickledeals/shared';
import { useState } from 'react';

import { supabase } from '../lib/supabase';

type Kind = 'brands' | 'categories' | 'products';
type Report = {
  dry_run: boolean;
  applied: boolean;
  errors: { entity: string; slug: string; message: string }[];
} & Record<'brands' | 'categories' | 'products' | 'variants', { created: number; updated: number }>;

/**
 * CSV import (same format and validator as supabase/seed). Always dry-run first: the database
 * reports what would change, and Apply is enabled only for a clean dry run of the same files.
 */
export function ImportPage() {
  const [files, setFiles] = useState<Partial<Record<Kind, string>>>({});
  const [names, setNames] = useState<Partial<Record<Kind, string>>>({});
  const [issues, setIssues] = useState<CatalogIssue[]>([]);
  const [payload, setPayload] = useState<CatalogPayload | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (kind: Kind, file: File | undefined) => {
    setReport(null);
    setPayload(null);
    const next = { ...files };
    if (file) next[kind] = await file.text();
    else delete next[kind];
    setFiles(next);
    setNames((n) => ({ ...n, [kind]: file?.name }));
    const built = buildCatalogPayload(next);
    setIssues(built.issues);
    setPayload(built.issues.length ? null : built.payload);
  };

  const run = async (dryRun: boolean) => {
    if (!payload) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('import_catalog', { payload: payload as never, dry_run: dryRun });
    setBusy(false);
    if (error) return setError(error.message);
    setReport(data as unknown as Report);
  };

  const canApply = report?.dry_run && report.errors.length === 0;

  return (
    <>
      <h1>CSV import</h1>
      <p className="muted">
        Upserts by slug; nothing is deleted. Products are one row per variant — see supabase/seed/README.md for columns. Any row error rolls back the whole import.
      </p>
      <div className="card">
        {(['brands', 'categories', 'products'] as const).map((kind) => (
          <label key={kind} className="field">
            {kind}.csv {names[kind] && <span className="muted">— {names[kind]}</span>}
            <input type="file" accept=".csv,text/csv" onChange={(e) => pick(kind, e.target.files?.[0])} />
          </label>
        ))}
      </div>

      {issues.length > 0 && (
        <>
          <h2>Fix these rows first</h2>
          <table>
            <tbody>
              {issues.map((i, n) => (
                <tr key={n}>
                  <td className="num" style={{ width: 160 }}>
                    {i.file}.csv{i.line ? `:${i.line}` : ''}
                  </td>
                  <td>{i.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {payload && (
        <div className="row" style={{ marginTop: 16 }}>
          <span className="grow">
            Parsed {payload.brands.length} brands · {payload.categories.length} categories · {payload.products.length} products (
            {payload.products.reduce((n, p) => n + p.variants.length, 0)} variants)
          </span>
          <button className="btn" disabled={busy} onClick={() => run(true)}>
            Dry run
          </button>
          <button className="btn primary" disabled={busy || !canApply} onClick={() => run(false)}>
            Apply
          </button>
        </div>
      )}

      {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}

      {report && (
        <div className="card" style={{ marginTop: 16 }}>
          <strong>{report.applied ? 'Applied' : report.dry_run ? 'Dry run — nothing was written' : 'Not applied — nothing was written'}</strong>
          <table>
            <thead>
              <tr>
                <th />
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {(['brands', 'categories', 'products', 'variants'] as const).map((k) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{report[k].created}</td>
                  <td className="num">{report[k].updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.errors.map((e, i) => (
            <div key={i} className="notice error">
              {e.entity} <strong>{e.slug}</strong>: {e.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
