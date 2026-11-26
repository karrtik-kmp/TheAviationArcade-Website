import { SiteLink as Link } from "@/components/SiteLink";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { GameVisual } from "@/components/Games";
import { roundelFor } from "@/lib/game-art";
import { games } from "@/lib/catalog";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title: games.find((g) => g.slug === slug)?.name ?? "Game not found",
  };
}
export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = games.find((g) => g.slug === slug);
  if (!game) notFound();
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro game-intro">
          <div className="breadcrumbs">
            <Link href="/games">Games</Link>
            <span>/</span>
            <span>{game.name}</span>
          </div>
          <div className="game-title">
            <img src={roundelFor(game)} alt="" width="96" height="96" />
            <h1>{game.name}</h1>
          </div>
          <p className="page-subheading">{game.detail?.heading ?? game.description}</p>
        </header>
        <section className="wrap detail-layout">
          <div>
            <GameVisual game={game} />
            <div className="info-note">
              {game.status}. Release details will appear here when the game is
              available in a public app release.
            </div>
          </div>
          <div className="detail-copy">
            {game.detail ? (
              <>
                <h2>{game.detail.actionsHeading}</h2>
                {game.detail.body.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                <p className="mission-card">
                  <strong>Your Mission:</strong> {game.detail.mission}
                </p>
              </>
            ) : (
              <>
                <h2>About this game</h2>
                <p>
                  {game.name} is one of the Airplane Games arcade titles. It is
                  played in the mobile app, not on this website, which is where
                  you can learn about the games, share photography and follow
                  the community.
                </p>
              </>
            )}
            <div className="actions">
              {/* Labels: client ruling 2026-11-23. The games are played in the app, so the
                  primary button leads to the app release details, not to play. */}
              <Link className="btn" href="/get-the-app">
                Get Ready to Play
              </Link>
              <Link
                className="btn secondary"
                href={`/contribute?game=${game.slug}`}
              >
                Be an Airport Spotter, Share your Photos
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
