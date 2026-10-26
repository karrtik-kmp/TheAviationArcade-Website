import { SiteLink as Link } from "@/components/SiteLink";
import {
  ArrowUpRight,
  AirplaneTilt,
  Camera,
  Medal,
} from "@phosphor-icons/react/dist/ssr";
import { PublicShell } from "@/components/PublicShell";
import { GameCard } from "@/components/Games";
import { Featured } from "@/components/Featured";
import { games, photographer, photographerUrl } from "@/lib/catalog";
import { sitePath } from "@/lib/paths";
export default function Home() {
  return (
    <PublicShell>
      <main id="main">
        <section className="wrap hero">
          <div className="hero-copy reveal">
            <span className="eyebrow">For the love of aviation</span>
            <h1>Think you know airplanes?</h1>
            <p>
              Eight aviation games, coming to mobile. Read about them, join the
              community and share your photography, from the window seat to the
              captain&apos;s chair.
            </p>
            <div className="actions">
              <Link href="/games" className="btn">
                Explore games <ArrowUpRight size={18} />
              </Link>
              <Link href="/contribute" className="btn secondary">
                Share a photo
              </Link>
            </div>
          </div>
          <figure className="hero-photo reveal">
            <img
              src={sitePath("/media/hero.webp")}
              srcSet={`${sitePath("/media/hero-640.webp")} 640w, ${sitePath("/media/hero.webp")} 1440w`}
              sizes="(max-width:767px) 100vw, 50vw"
              alt="A KLM aircraft on approach against an open blue sky"
              width="1440"
              height="1000"
              fetchPriority="high"
            />
            <figcaption className="photo-credit">
              <span>A different view of the everyday.</span>
              <a href={photographerUrl} target="_blank" rel="noreferrer">
                Photography by {photographer}
              </a>
            </figcaption>
          </figure>
        </section>
        <div className="wrap intro-rule">
          <div>
            <AirplaneTilt size={29} />
            <div>
              <strong>Eight aviation games</strong>
              <small>Recognition, matching and word games</small>
            </div>
          </div>
          <div>
            <Medal size={29} />
            <div>
              <strong>Five ranks, one ladder</strong>
              <small>From Trainee to Chief Pilot</small>
            </div>
          </div>
          <div>
            <Camera size={29} />
            <div>
              <strong>Real photos. Real plane people.</strong>
              <small>A community with an eye for aviation</small>
            </div>
          </div>
        </div>
        <section className="wrap section">
          <div className="section-top">
            <div>
              <h2>Meet the games.</h2>
              <p>
                From the shape of a 747 to the code for Heathrow, a quick look
                at what&apos;s coming to the app.
              </p>
            </div>
            <Link href="/games" className="text-link">
              All eight games <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="game-grid home-games">
            {[games[0], games[3], games[1]].map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </section>
        <section className="photo-feature">
          <div className="wrap section">
            <Featured compact />
          </div>
        </section>
        <section className="wrap section">
          <div className="community">
            <img
              src={sitePath("/media/community.webp")}
              alt=""
              width="1800"
              height="600"
              loading="lazy"
            />
            <div>
              <h2>Your perspective belongs here.</h2>
              <p>
                Aircraft, airports, tails or life around the tower. Help build
                the collection behind our games.
              </p>
              <Link className="btn" href="/contribute">
                Share a photo <ArrowUpRight size={18} />
              </Link>
            </div>
          </div>
          <p className="community-caption">
            Community illustration. Submitted game photographs are reviewed
            separately.
          </p>
        </section>
      </main>
    </PublicShell>
  );
}
