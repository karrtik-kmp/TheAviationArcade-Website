import { SiteLink as Link } from "@/components/SiteLink";
import { PublicShell } from "@/components/PublicShell";

/**
 * A section of the site that is planned but has no client content yet. It names no dates,
 * products or answers: those come from the client (website CQ-5, CQ-8).
 */
export function ComingSoonPage({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="page-subheading">Coming soon.</p>
          <p>{intro}</p>
        </header>
        <section className="wrap section" style={{ paddingTop: 12 }}>
          <div className="actions">
            <Link className="btn" href="/games">
              Explore the games
            </Link>
            <Link className="btn secondary" href="/plane-of-the-day">
              See the Plane of the Day
            </Link>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
