'use client';

import { useState } from 'react';

import { SUPABASE_URL } from '@/lib/urls';

/**
 * A button rather than unsubscribing on load, so link scanners in mail filters don't turn emails off.
 * Posts the token from the email link to the email-unsubscribe function.
 */
export function Unsubscribe() {
  const [state, setState] = useState<'ask' | 'busy' | 'done' | 'error'>('ask');
  const run = async () => {
    const token = new URLSearchParams(window.location.search).get('t') ?? '';
    setState('busy');
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/email-unsubscribe?t=${encodeURIComponent(token)}`, { method: 'POST' });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };
  return (
    <article className="doc">
      <h1>{state === 'done' ? 'Emails turned off' : 'Turn off emails?'}</h1>
      <p className="meta">
        {state === 'done'
          ? 'You won’t get emails about missed offers and messages anymore.'
          : state === 'error'
            ? 'That didn’t work. Try again, or turn emails off in the app under Profile › Notifications.'
            : 'We’ll stop emailing you about offers and messages you missed. Push notifications and the app aren’t affected.'}
      </p>
      {state !== 'done' && (
        <p>
          <button type="button" className="btn btn-primary" onClick={run} disabled={state === 'busy'}>
            {state === 'busy' ? 'Turning off…' : 'Turn off emails'}
          </button>
        </p>
      )}
      <p>
        You can turn them back on any time in the app under <strong>Profile › Notifications › Email me what I miss</strong>. Notices about your account itself, such as a removed listing, are
        still sent.
      </p>
    </article>
  );
}
