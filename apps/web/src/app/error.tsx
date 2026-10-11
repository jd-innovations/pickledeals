'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page tight wrap">
      <div className="empty" style={{ marginTop: 24 }}>
        <h1 style={{ fontSize: 28 }}>Couldn’t load this page</h1>
        <p>We couldn’t reach our prices just now. Check your connection and try again.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
