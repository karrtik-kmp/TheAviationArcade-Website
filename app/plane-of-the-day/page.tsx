import { PublicShell } from "@/components/PublicShell";
import { Featured } from "@/components/Featured";
export const metadata = { title: "Plane of the Day" };
export default function PotdPage() {
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro">
          <h1>Plane of the Day.</h1>
          <p>
            A closer look at the aircraft we love and the photographers who see
            them differently.
          </p>
        </header>
        <section className="wrap section" style={{ paddingTop: 12 }}>
          <Featured />
        </section>
      </main>
    </PublicShell>
  );
}
