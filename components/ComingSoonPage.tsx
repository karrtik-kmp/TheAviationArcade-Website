import { SiteLink as Link } from "@/components/SiteLink";
import { PublicShell } from "@/components/PublicShell";
import { sitePath } from "@/lib/paths";

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
        <section className="wrap coming-soon">
          <header className="page-intro">
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p className="page-subheading">Coming soon.</p>
            <p>{intro}</p>
            <div className="actions">
              <Link className="btn" href="/games">
                Explore the games
              </Link>
              <Link className="btn secondary" href="/plane-of-the-day">
                See the Plane of the Day
              </Link>
            </div>
          </header>
          {/* A client Plane of the Day photograph (Josh M, "Queen", ASSET_PROVENANCE.md). */}
          <img
            className="coming-soon-photo"
            src={sitePath("/media/potd-8.webp")}
            srcSet={`${sitePath("/media/potd-8-640.webp")} 640w, ${sitePath("/media/potd-8.webp")} 1600w`}
            sizes="(max-width:899px) 100vw, 45vw"
            alt="A Boeing 747-8F photographed by Josh M"
            width="1600"
            height="1068"
          />
        </section>
      </main>
    </PublicShell>
  );
}
