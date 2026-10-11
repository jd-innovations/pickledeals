// Partner applications (website "Partner with PickleDeals"): validation and the Shopify check.
// Pure functions shared by the partner-apply edge function; tested in packages/shared.

export const PARTNER_INTERESTS = ['store', 'promo_code', 'sponsored'] as const;
export type PartnerInterest = (typeof PARTNER_INTERESTS)[number];

export type PartnerApplication = {
  company: string;
  name: string;
  email: string;
  store: string;
  interests: PartnerInterest[];
  message: string | null;
};

export type ApplicationCheck = { ok: true; value: PartnerApplication & { storeHost: string } } | { ok: false; field: string; message: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HOST = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * "https://www.CourtGear.com/collections/all" → "www.courtgear.com". Null for anything that isn't a
 * public host name (IP addresses, localhost, internal names), so the check never reaches private networks.
 */
export function normalizeStoreHost(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  let host: string;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password || (u.port && u.port !== '443' && u.port !== '80')) return null;
    host = u.hostname.replace(/\.$/, '');
  } catch {
    return null;
  }
  if (!HOST.test(host)) return null;
  if (/^\d+(\.\d+){3}$/.test(host) || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost') return null;
  return host;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');

/** Validates the form body. Messages are written for the person filling the form in. */
export function checkApplication(body: Record<string, unknown>): ApplicationCheck {
  const company = str(body.company, 120);
  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  const store = str(body.store, 300);
  const message = str(body.message, 2000);
  const raw = Array.isArray(body.interests) ? body.interests : [];
  const interests = [...new Set(raw.filter((i): i is PartnerInterest => (PARTNER_INTERESTS as readonly unknown[]).includes(i)))];

  if (!company || company.length > 120) return { ok: false, field: 'company', message: 'Enter your brand or store name.' };
  if (!name || name.length > 120) return { ok: false, field: 'name', message: 'Enter your name.' };
  if (!EMAIL.test(email) || email.length > 200) return { ok: false, field: 'email', message: 'Enter an email address we can reply to.' };
  const storeHost = normalizeStoreHost(store);
  if (!storeHost) return { ok: false, field: 'store', message: 'Enter your store’s web address, like courtgear.com or courtgear.myshopify.com.' };
  if (!interests.length) return { ok: false, field: 'interests', message: 'Choose at least one way you’d like to partner.' };
  if (message.length > 2000) return { ok: false, field: 'message', message: 'Keep the message under 2,000 characters.' };
  return { ok: true, value: { company, name, email, store, storeHost, interests, message: message || null } };
}

export type ShopifyCheck = { shopify: true; myshopifyDomain: string | null; shopName: string | null } | { shopify: false };

/** Reads a store's public /meta.json (every Shopify storefront serves it). */
export function shopifyFromMeta(meta: unknown): ShopifyCheck {
  if (!meta || typeof meta !== 'object') return { shopify: false };
  const m = meta as { myshopify_domain?: unknown; name?: unknown };
  const domain = typeof m.myshopify_domain === 'string' ? m.myshopify_domain.toLowerCase() : null;
  if (!domain || !/^[a-z0-9-]+\.myshopify\.com$/.test(domain)) return { shopify: false };
  return { shopify: true, myshopifyDomain: domain, shopName: typeof m.name === 'string' ? m.name.slice(0, 200) : null };
}

/** Fallback when /meta.json is blocked: Shopify storefronts send identifying response headers. */
export function shopifyFromHeaders(headers: Headers): ShopifyCheck {
  const powered = headers.get('powered-by') ?? '';
  if (headers.has('x-shopid') || headers.has('x-shopify-stage') || /shopify/i.test(powered)) return { shopify: true, myshopifyDomain: null, shopName: null };
  return { shopify: false };
}

export const PARTNER_INTEREST_LABELS: Record<PartnerInterest, string> = {
  store: 'Connecting their Shopify store',
  promo_code: 'An exclusive promo code',
  sponsored: 'Sponsored placement',
};
