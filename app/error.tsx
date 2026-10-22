"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="wrap section">
      <h1>We couldn&apos;t load this page.</h1>
      <p className="muted" style={{ margin: "24px 0" }}>
        Your submitted content stays saved on the server. Try loading the page
        again.
      </p>
      <button className="btn" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
