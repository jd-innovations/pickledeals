// Missed-message, review and account-notice emails: rendering (HTML + plain text) and Resend webhook
// verification.
// Pure functions shared by dispatch-emails and email-events; tested in packages/shared.
// The look matches the sign-in code email (supabase/templates/email-code.html).

export type EmailKind = 'offer' | 'new_message' | 'review' | 'system';

export type EmailInput = {
  kind: EmailKind;
  title: string;
  body: string;
  route: string | null;
  listingTitle: string | null;
  unread: number;
  /** Visible "turn off" link; omitted for account notices, which aren't optional. */
  unsubscribeUrl: string | null;
  siteUrl: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export const POSTAL_LINE = 'PickleDeals · Bradenton, Florida';

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The site's /open page hands the in-app route to the app (pickledeals:// scheme). */
export function openUrl(siteUrl: string, route: string | null): string {
  const safe = route && /^\/[A-Za-z0-9/_-]*$/.test(route) ? route : '/';
  return `${siteUrl}/open?to=${encodeURIComponent(safe)}`;
}

export function renderEmail(input: EmailInput): RenderedEmail {
  const { kind, title, body, listingTitle, unread } = input;
  const about = listingTitle ? `About ${listingTitle}` : null;
  let subject: string;
  let heading: string;
  let note: string | null = null;
  let cta: string;

  if (kind === 'new_message') {
    const sender = title && title !== 'New message' ? title : 'Someone';
    heading = `${sender} sent you a message`;
    subject = listingTitle ? `${heading} about ${listingTitle}` : heading;
    if (unread > 1) note = `You have ${unread} unread messages in this conversation.`;
    cta = 'Reply in PickleDeals';
  } else if (kind === 'offer') {
    heading = title;
    subject = listingTitle ? `${title} · ${listingTitle}` : title;
    cta = 'Open the offer';
  } else if (kind === 'review') {
    // Either "How was buying … from …?" (to the buyer) or "… left you a 5-star review" (to the seller).
    heading = title;
    subject = title;
    cta = input.route?.startsWith('/rate-seller/') ? 'Rate your purchase' : 'See your reviews';
  } else {
    heading = title;
    subject = title;
    cta = 'Open PickleDeals';
  }

  const link = openUrl(input.siteUrl, input.route);
  const reason =
    kind === 'system'
      ? 'This is a notice about your PickleDeals account.'
      : kind === 'review'
        ? 'You’re getting this because of a sale on PickleDeals, and the notification was unread for an hour.'
        : 'You’re getting this because a conversation on PickleDeals was unread for an hour.';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f3;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f3;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:20px;">
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <img src="${input.siteUrl}/brand/v2/pd-logo-black-480.png" width="150" height="40" alt="PickleDeals" style="display:block;border:0;width:150px;height:auto;">
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0 32px;font-family:${FONT};color:#0a0a0a;">
            <h1 style="margin:0 0 6px 0;font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.3px;">${escapeHtml(heading)}</h1>
            ${about ? `<p style="margin:0;font-size:15px;line-height:22px;color:#555555;">${escapeHtml(about)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0 32px;">
            <div style="background:#f4f4f3;border-radius:14px;padding:16px 18px;font-family:${FONT};font-size:16px;line-height:24px;color:#0a0a0a;font-variant-numeric:tabular-nums;white-space:pre-line;">${escapeHtml(body)}</div>
            ${note ? `<p style="margin:12px 0 0 0;font-family:${FONT};font-size:14px;line-height:21px;color:#555555;">${escapeHtml(note)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 32px 32px;">
            <a href="${escapeHtml(link)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;padding:14px 22px;border-radius:999px;">${escapeHtml(cta)}</a>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td style="padding:20px 32px;font-family:${FONT};font-size:12px;line-height:18px;color:#717171;">
            ${escapeHtml(reason)}${
              input.unsubscribeUrl
                ? ` <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#555555;">Turn off these emails</a>, or change it in the app under Profile › Notifications.`
                : ''
            }<br><br>
            Questions? <a href="mailto:support@pickledeals.app" style="color:#555555;">support@pickledeals.app</a><br>
            <a href="${input.siteUrl}/privacy" style="color:#717171;">Privacy</a> · <a href="${input.siteUrl}/terms" style="color:#717171;">Terms</a> · JD Innovations LLC<br>
            ${escapeHtml(POSTAL_LINE)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    heading,
    about,
    '',
    body,
    note,
    '',
    `${cta}: ${link}`,
    '',
    '—',
    reason,
    input.unsubscribeUrl ? `Turn off these emails: ${input.unsubscribeUrl}` : null,
    'Questions? support@pickledeals.app',
    POSTAL_LINE,
  ]
    .filter((l) => l !== null)
    .join('\n');

  return { subject: subject.slice(0, 150), html, text };
}

// --- Resend webhooks (Svix signatures) -------------------------------------------------------------

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/**
 * Verifies a Resend webhook: `svix-signature` holds space-separated `v1,<base64>` HMAC-SHA256 values
 * of `${svix-id}.${svix-timestamp}.${body}`, keyed with the base64 part of the `whsec_` secret.
 * Rejects timestamps more than 5 minutes off.
 */
export async function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('raw', b64ToBytes(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    return false;
  }
  const expected = bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && sig !== undefined && timingSafeEqual(sig, expected);
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Which Resend events stop email to an address: hard bounces and spam complaints. */
export function suppressionFor(event: { type?: string; data?: { to?: string[] | string; bounce?: { type?: string } } }):
  { emails: string[]; reason: 'bounced' | 'complained' } | null {
  const to = event.data?.to;
  const emails = (Array.isArray(to) ? to : to ? [to] : []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return null;
  if (event.type === 'email.complained') return { emails, reason: 'complained' };
  if (event.type === 'email.bounced' && event.data?.bounce?.type?.toLowerCase() !== 'transient') return { emails, reason: 'bounced' };
  return null;
}
