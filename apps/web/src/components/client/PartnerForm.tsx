'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { SUPABASE_URL } from '@/lib/urls';

import { Icon } from '../Icon';

const INTERESTS = [
  { value: 'store', label: 'Connecting my Shopify store' },
  { value: 'promo_code', label: 'An exclusive promo code' },
  { value: 'sponsored', label: 'Sponsored placement' },
] as const;

type State =
  | { kind: 'form'; error?: { field: string; message: string } }
  | { kind: 'sending' }
  | { kind: 'not_shopify'; host: string }
  | { kind: 'sent'; company: string; email: string };

/**
 * Partner application. Posts to the partner-apply function, which checks the store runs on Shopify,
 * saves the application and emails the team. The "website" field is a hidden trap for bots.
 */
export function PartnerForm() {
  const [state, setState] = useState<State>({ kind: 'form' });
  const [values, setValues] = useState({ company: '', name: '', email: '', store: '', message: '', interests: ['store'] as string[] });

  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues({ ...values, [k]: e.target.value });
  const toggle = (v: string) => setValues({ ...values, interests: values.interests.includes(v) ? values.interests.filter((x) => x !== v) : [...values.interests, v] });

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trap = (new FormData(e.currentTarget).get('website') as string) ?? '';
    setState({ kind: 'sending' });
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/partner-apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...values, website: trap }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; field?: string; message?: string; host?: string };
      if (res.ok) return setState({ kind: 'sent', company: values.company.trim(), email: values.email.trim() });
      if (body.error === 'not_shopify') return setState({ kind: 'not_shopify', host: body.host ?? values.store });
      setState({ kind: 'form', error: { field: body.field ?? 'form', message: body.message ?? 'We couldn’t send your application. Try again in a minute.' } });
    } catch {
      setState({ kind: 'form', error: { field: 'form', message: 'We couldn’t reach PickleDeals. Check your connection and try again.' } });
    }
  };

  if (state.kind === 'sent') {
    return (
      <div className="partner-card" role="status">
        <div className="partner-sent">
          <span className="ok" aria-hidden="true">
            ✓
          </span>
          <h2>Thanks, {state.company}</h2>
          <p className="muted">
            We got your application and found your Shopify store. We’ll email {state.email}, usually within two business days, with next steps for connecting your store.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setValues({ company: '', name: '', email: '', store: '', message: '', interests: ['store'] });
              setState({ kind: 'form' });
            }}>
            Send another
          </button>
        </div>
      </div>
    );
  }

  const err = state.kind === 'form' ? state.error : undefined;
  const invalid = (f: string) => (err?.field === f ? { 'aria-invalid': true, 'aria-describedby': 'partner-error' } : {});
  return (
    <form id="apply" className="partner-card" onSubmit={submit} noValidate>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Apply to partner</h2>
        <span className="muted" style={{ fontSize: 14 }}>
          We reply by email, usually within two business days.
        </span>
      </div>
      {state.kind === 'not_shopify' && (
        <div className="partner-alert" role="alert">
          <b>We couldn’t find a Shopify store at {state.host}.</b> We currently partner with Shopify stores only. Check the address, or use your <code>name.myshopify.com</code> address.
        </div>
      )}
      {err && (
        <div className="partner-alert" role="alert" id="partner-error">
          {err.message}
        </div>
      )}
      <div className="partner-fields-2">
        <label className="field">
          Brand or store name
          <input value={values.company} onChange={set('company')} required maxLength={120} autoComplete="organization" placeholder="CourtGear" {...invalid('company')} />
        </label>
        <label className="field">
          Your name
          <input value={values.name} onChange={set('name')} required maxLength={120} autoComplete="name" placeholder="Alex Rivera" {...invalid('name')} />
        </label>
      </div>
      <label className="field">
        Work email
        <input type="email" value={values.email} onChange={set('email')} required maxLength={200} autoComplete="email" placeholder="alex@courtgear.com" {...invalid('email')} />
      </label>
      <label className="field">
        Shopify store address
        <input
          value={values.store}
          onChange={set('store')}
          required
          maxLength={300}
          inputMode="url"
          autoCapitalize="none"
          placeholder="courtgear.com or courtgear.myshopify.com"
          {...(state.kind === 'not_shopify' ? { 'aria-invalid': true } : invalid('store'))}
        />
        <span className="hint">We check that it’s a Shopify store when you send this.</span>
      </label>
      <fieldset className="field-set" {...invalid('interests')}>
        <legend>I’m interested in</legend>
        {INTERESTS.map((i) => (
          <label key={i.value} className="check-row">
            <input type="checkbox" checked={values.interests.includes(i.value)} onChange={() => toggle(i.value)} />
            <span>{i.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>
          Anything else? <span className="muted" style={{ fontWeight: 400 }}>Optional</span>
        </span>
        <textarea value={values.message} onChange={set('message')} maxLength={2000} rows={4} placeholder="Which products, launch dates, codes you’d like to offer…" />
      </label>
      {/* Hidden from people; bots that fill it in are ignored. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={state.kind === 'sending'}>
        {state.kind === 'sending' ? 'Checking your store…' : 'Send application'}
        {state.kind !== 'sending' && <Icon name="chevronRight" size={16} stroke={2.2} />}
      </button>
      <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
        We use these details only to reply about partnering. See our <Link href="/privacy" style={{ textDecoration: 'underline' }}>Privacy Policy</Link>.
      </span>
    </form>
  );
}
