import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="page tight wrap">
      <div className="empty" style={{ marginTop: 24 }}>
        <h1 style={{ fontSize: 28 }}>This page isn’t here</h1>
        <p>The deal may have ended, or the link may be mistyped. Today’s deals are a click away.</p>
        <Link href="/" className="btn btn-primary btn-sm">
          See today’s deals
        </Link>
      </div>
    </main>
  );
}
