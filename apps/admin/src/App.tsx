import { useEffect, useState, type FormEvent } from 'react';

import { useSession } from './lib/session';
import { supabase } from './lib/supabase';
import { BrandsPage } from './pages/Brands';
import { CategoriesPage } from './pages/Categories';
import { ImportPage } from './pages/Import';
import { ProductEditPage } from './pages/ProductEdit';
import { ProductsPage } from './pages/Products';

/**
 * Internal admin (D7, Phase 2 minimal): catalog CRUD, images with provenance (D8) and CSV import.
 * Staff only — the UI checks the app_role claim, and RLS enforces it on every write.
 */
export default function App() {
  const { session, ready, role } = useSession();
  if (!ready) return null;
  if (!session) return <SignIn />;
  if (role !== 'admin' && role !== 'editor') return <NoAccess email={session.user.email ?? ''} />;
  return <Shell role={role} />;
}

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'products';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route.split('/');
}

export const go = (path: string) => {
  window.location.hash = `/${path}`;
};

function Shell({ role }: { role: string }) {
  const [section, id] = useHashRoute();
  const link = (path: string, label: string) => (
    <a href={`#/${path}`} className={section === path ? 'on' : ''}>
      {label}
    </a>
  );
  return (
    <div className="shell">
      <nav className="nav">
        <strong>PickleDeals Admin</strong>
        {link('products', 'Products')}
        {link('brands', 'Brands')}
        {link('categories', 'Categories')}
        {link('import', 'CSV import')}
        <span className="spacer" />
        <span className="muted" style={{ padding: '0 10px', fontSize: 12 }}>
          Signed in as {role}
        </span>
        <a href="#" onClick={() => supabase.auth.signOut()}>
          Sign out
        </a>
      </nav>
      <main className="main">
        {section === 'products' && (id ? <ProductEditPage slug={id === 'new' ? null : decodeURIComponent(id)} /> : <ProductsPage />)}
        {section === 'brands' && <BrandsPage />}
        {section === 'categories' && <CategoriesPage />}
        {section === 'import' && <ImportPage />}
      </main>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = sent
      ? await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
      : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) setError(error.message);
    else if (!sent) setSent(true);
  };

  return (
    <form className="center" onSubmit={submit}>
      <h1>PickleDeals Admin</h1>
      <p className="muted">{sent ? `Enter the 6-digit code sent to ${email}.` : 'Staff only. Sign in with your work email.'}</p>
      {sent ? (
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
      ) : (
        <input autoFocus type="email" autoComplete="email" placeholder="you@pickledeals.app" value={email} onChange={(e) => setEmail(e.target.value)} />
      )}
      {error && <div className="notice error">{error}</div>}
      <button className="btn primary" disabled={busy}>
        {sent ? 'Verify' : 'Send code'}
      </button>
    </form>
  );
}

function NoAccess({ email }: { email: string }) {
  return (
    <div className="center">
      <h1>No admin access</h1>
      <p className="muted">{email} isn’t an admin or editor. Ask an admin to grant a role, then sign in again.</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}
