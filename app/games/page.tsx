import { SiteLink as Link } from "@/components/SiteLink";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { PublicShell } from "@/components/PublicShell";
import { Catalog } from "@/components/Games";
export const metadata = { title: "The games" };
export default function GamesPage() {
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro">
          <span className="eyebrow">The Aviation Arcade</span>
          <h1>Choose Your Flight.</h1>
          <p className="page-subheading">
            Eight Games. Countless Challenges. One Aviation Obsession.
          </p>
          <p>
            Whether you&apos;re an airplane expert, an airport enthusiast, or
            simply curious about the world of flight, there&apos;s a challenge
            waiting for you.
          </p>
          <p>Pick a game, test your skills, and see how much you really know.</p>
        </header>
        <Catalog />
        <section className="wrap closing-cta">
          <h2>Your Next Challenge Is Cleared for Takeoff.</h2>
          <p>
            Eight games to explore, new skills to master, and five ranks to
            climb. Whether you have five minutes or an afternoon, there&apos;s
            always another aviation challenge waiting.
          </p>
          <Link href="/get-the-app" className="btn">
            Prepare for Takeoff <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
    </PublicShell>
  );
}
