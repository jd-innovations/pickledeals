'use client';

import { useEffect, useState } from 'react';

const IN_APP_ROUTE = /^\/[A-Za-z0-9/_-]*$/;

export function OpenInApp() {
  const [href, setHref] = useState('pickledeals://');
  useEffect(() => {
    let to = new URLSearchParams(window.location.search).get('to') || '/';
    if (!IN_APP_ROUTE.test(to)) to = '/';
    const url = `pickledeals:/${to}`;
    setHref(url);
    window.location.href = url;
  }, []);
  return (
    <article className="doc">
      <h1>Open in PickleDeals</h1>
      <p className="meta">This link opens the PickleDeals app on your iPhone.</p>
      <p>
        <a className="btn btn-primary" href={href} style={{ textDecoration: 'none' }}>
          Open the app
        </a>
      </p>
      <p>
        Nothing happened? Open PickleDeals yourself. Your messages and offers are in the app under <strong>Profile</strong>, and alerts are in the <strong>Alerts</strong> tab.
      </p>
    </article>
  );
}
