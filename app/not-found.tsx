import { SiteLink as Link } from "@/components/SiteLink";
import { PublicShell } from "@/components/PublicShell";
export default function NotFound() {
  return (
    <PublicShell>
      <main id="main" className="wrap section">
        <h1>Looks Like We&apos;ve Gone Off Course!</h1>
        <p className="muted" style={{ margin: "24px 0" }}>
          Even the best pilots occasionally need to find their way back.
          Let&apos;s get you headed in the right direction.
        </p>
        <Link href="/" className="btn">
          Return to the Hangar
        </Link>
      </main>
    </PublicShell>
  );
}
