import { PublicShell } from "@/components/PublicShell";
import { Catalog } from "@/components/Games";
export const metadata = { title: "The games" };
export default function GamesPage() {
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro">
          <h1>Eight games. One aviation obsession.</h1>
          <p>
            From the aircraft overhead to the airport below. Explore the arcade
            and find the challenge that speaks your language.
          </p>
        </header>
        <Catalog />
      </main>
    </PublicShell>
  );
}
