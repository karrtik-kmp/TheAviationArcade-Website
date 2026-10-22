import { SiteLink as Link } from "@/components/SiteLink";
import { PublicShell } from "@/components/PublicShell";
export default function NotFound() {
  return (
    <PublicShell>
      <main id="main" className="wrap section">
        <h1>This destination is unavailable.</h1>
        <p className="muted" style={{ margin: "24px 0" }}>
          Return to the arcade to explore the games.
        </p>
        <Link href="/games" className="btn">
          Explore games
        </Link>
      </main>
    </PublicShell>
  );
}
