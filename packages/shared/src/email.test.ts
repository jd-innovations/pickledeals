import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { escapeHtml, openUrl, POSTAL_LINE, renderEmail, suppressionFor, verifyWebhook } from '../../../supabase/functions/_shared/email';

const SITE = 'https://pickledeals.app';
const base = { route: '/conversation/7d1c2b3a-0000-4000-8000-000000000001', listingTitle: 'JOOLA Perseus Pro IV', unread: 1, siteUrl: SITE };

describe('renderEmail', () => {
  it('names the sender and the listing for messages', () => {
    const e = renderEmail({ ...base, kind: 'new_message', title: 'Dana B.', body: 'Still available?', unsubscribeUrl: `${SITE}/unsubscribe?t=x` });
    expect(e.subject).toBe('Dana B. sent you a message about JOOLA Perseus Pro IV');
    expect(e.html).toContain('Reply in PickleDeals');
    expect(e.html).toContain('href="https://pickledeals.app/open?to=%2Fconversation%2F7d1c2b3a-0000-4000-8000-000000000001"');
    expect(e.text).toContain('Still available?');
  });

  it('mentions how many messages are waiting', () => {
    const e = renderEmail({ ...base, kind: 'new_message', title: 'Dana B.', body: 'Hi', unread: 3, unsubscribeUrl: null });
    expect(e.text).toContain('You have 3 unread messages in this conversation.');
  });

  it('uses the offer title as the subject', () => {
    const e = renderEmail({ ...base, kind: 'offer', title: 'New offer: $120', body: 'Dana B. offered $120.', unsubscribeUrl: `${SITE}/unsubscribe?t=x` });
    expect(e.subject).toBe('New offer: $120 · JOOLA Perseus Pro IV');
    expect(e.html).toContain('Open the offer');
  });

  it('asks the buyer to rate the purchase, and shows sellers their reviews', () => {
    const ask = renderEmail({
      ...base,
      kind: 'review',
      title: 'How was buying JOOLA Perseus Pro IV from Jordan?',
      body: 'Rate your purchase. It helps other players buy with confidence.',
      route: '/rate-seller/7d1c2b3a-0000-4000-8000-000000000002',
      unsubscribeUrl: `${SITE}/unsubscribe?t=x`,
    });
    expect(ask.subject).toBe('How was buying JOOLA Perseus Pro IV from Jordan?');
    expect(ask.html).toContain('Rate your purchase');
    expect(ask.html).toContain('href="https://pickledeals.app/open?to=%2Frate-seller%2F7d1c2b3a-0000-4000-8000-000000000002"');
    expect(ask.text).toContain('because of a sale on PickleDeals');
    expect(ask.text).toContain('Turn off these emails');

    const got = renderEmail({ ...base, kind: 'review', title: 'Dana left you a 5-star review', body: 'Smooth meet-up.', route: '/seller/7d1c2b3a-0000-4000-8000-000000000003', unsubscribeUrl: null });
    expect(got.html).toContain('See your reviews');
  });

  it('escapes user text', () => {
    const e = renderEmail({ ...base, kind: 'new_message', title: '<b>Eve</b>', body: '<script>alert(1)</script> & "hi"', unsubscribeUrl: null });
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;hi&quot;');
    expect(e.html).toContain('&lt;b&gt;Eve&lt;/b&gt; sent you a message');
  });

  it('has the postal line, and an unsubscribe link only for optional emails', () => {
    const optional = renderEmail({ ...base, kind: 'offer', title: 'Offer', body: 'b', unsubscribeUrl: `${SITE}/unsubscribe?t=abc` });
    const notice = renderEmail({ ...base, kind: 'system', title: 'Your listing was removed', body: 'b', route: '/market/listing/x', listingTitle: null, unsubscribeUrl: null });
    expect(optional.html).toContain(escapeHtml(POSTAL_LINE));
    expect(optional.text).toContain('Turn off these emails: https://pickledeals.app/unsubscribe?t=abc');
    expect(notice.html).not.toContain('Turn off these emails');
    expect(notice.text).toContain(POSTAL_LINE);
    expect(notice.subject).toBe('Your listing was removed');
  });
});

describe('openUrl', () => {
  it('only passes plain in-app paths', () => {
    expect(openUrl(SITE, '/profile/offers')).toBe(`${SITE}/open?to=%2Fprofile%2Foffers`);
    expect(openUrl(SITE, 'https://evil.example')).toBe(`${SITE}/open?to=%2F`);
    expect(openUrl(SITE, '/x?y=<z>')).toBe(`${SITE}/open?to=%2F`);
    expect(openUrl(SITE, null)).toBe(`${SITE}/open?to=%2F`);
  });
});

describe('verifyWebhook', () => {
  const secret = 'whsec_' + Buffer.from('test-secret-key-0123456789').toString('base64');
  const body = '{"type":"email.bounced"}';
  const sign = (id: string, ts: string, b: string) =>
    'v1,' + createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${b}`).digest('base64');
  const now = 1_790_000_000;

  it('accepts a valid signature among several', async () => {
    const sig = `v1,bm9wZQ== ${sign('msg_1', String(now), body)}`;
    await expect(verifyWebhook(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body, now)).resolves.toBe(true);
  });

  it('rejects tampering, old timestamps and missing headers', async () => {
    const sig = sign('msg_1', String(now), body);
    await expect(verifyWebhook(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body + ' ', now)).resolves.toBe(false);
    await expect(verifyWebhook(secret, { id: 'msg_1', timestamp: String(now), signature: sig }, body, now + 301)).resolves.toBe(false);
    await expect(verifyWebhook(secret, { id: null, timestamp: String(now), signature: sig }, body, now)).resolves.toBe(false);
  });
});

describe('suppressionFor', () => {
  it('suppresses hard bounces and complaints, not transient bounces or deliveries', () => {
    expect(suppressionFor({ type: 'email.bounced', data: { to: ['A@Example.com'], bounce: { type: 'Permanent' } } })).toEqual({ emails: ['a@example.com'], reason: 'bounced' });
    expect(suppressionFor({ type: 'email.complained', data: { to: 'b@example.com' } })).toEqual({ emails: ['b@example.com'], reason: 'complained' });
    expect(suppressionFor({ type: 'email.bounced', data: { to: ['c@example.com'], bounce: { type: 'Transient' } } })).toBeNull();
    expect(suppressionFor({ type: 'email.delivered', data: { to: ['d@example.com'] } })).toBeNull();
  });
});
