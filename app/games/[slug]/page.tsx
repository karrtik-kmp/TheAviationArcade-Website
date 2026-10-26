import { SiteLink as Link } from "@/components/SiteLink";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { GameVisual } from "@/components/Games";
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
        <header className="wrap page-intro">
          <div className="breadcrumbs">
            <Link href="/games">Games</Link>
            <span>/</span>
            <span>{game.name}</span>
          </div>
          <h1>{game.name}</h1>
          <p>{game.description}</p>
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
            <h2>About this game</h2>
            <p>
              {game.name} is one of the Airplane Games arcade titles. It is
              played in the mobile app, not on this website, which is where you
              can learn about the games, share photography and follow the
              community.
            </p>
            <div className="actions">
              <Link className="btn" href="/get-the-app">
                Get the App
              </Link>
              <Link
                className="btn secondary"
                href={`/contribute?game=${game.slug}`}
              >
                Contribute content
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
