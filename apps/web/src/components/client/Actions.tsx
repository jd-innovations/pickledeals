'use client';

import { useState, type ReactNode } from 'react';

import { Icon } from '../Icon';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A promo code you can click to copy. Shows the code itself until copied. */
export function CodeButton({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="code-btn"
      aria-label={`Copy code ${code}`}
      onClick={async () => {
        if (await copyText(code)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }
      }}>
      {copied ? 'Copied' : (label ?? code)}
      <Icon name="copy" size={14} stroke={2} />
    </button>
  );
}

/**
 * "Get deal": copies the code first (when there is one the store doesn't apply itself), then opens
 * the go redirect in a new tab so the visitor keeps their place here.
 */
export function GetDealButton({ href, code, children, className = 'btn btn-primary' }: { href: string; code?: string | null; children: ReactNode; className?: string }) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener sponsored"
      onClick={() => {
        if (code) void copyText(code);
      }}>
      {children}
      <Icon name="external" size={16} stroke={2.2} />
    </a>
  );
}

/** Share: the system share sheet where there is one, otherwise copy the link. */
export function ShareButton({ path, title, className = 'icon-btn' }: { path: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label={copied ? 'Link copied' : 'Share'}
      title={copied ? 'Link copied' : 'Share'}
      onClick={async () => {
        const url = new URL(path, window.location.origin).toString();
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch {
            /* dismissed: fall through to copying */
          }
        }
        if (await copyText(url)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }
      }}>
      <Icon name="share" size={18} />
    </button>
  );
}
