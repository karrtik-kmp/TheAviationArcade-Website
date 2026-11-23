import { PublicShell } from "@/components/PublicShell";
import { Featured } from "@/components/Featured";
export const metadata = { title: "Plane of the Day" };
export default function PotdPage() {
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro">
          <h1>Plane of the Day.</h1>
          <p className="page-subheading">One Plane. One Story. Every Day.</p>
          <p>
            Some airplanes make you stop and stare. Others bring back memories
            of your first flight, your favorite trip, or an unforgettable moment
            at the airport. Plane of the Day is our celebration of the
            incredible aircraft that connect our world and the talented
            photographers who capture them.
          </p>
          <p>
            Discover something new, revisit an old favorite, and find one more
            reason to look up.
          </p>
        </header>
        <section className="wrap section" style={{ paddingTop: 12 }}>
          <Featured />
        </section>
      </main>
    </PublicShell>
  );
}
