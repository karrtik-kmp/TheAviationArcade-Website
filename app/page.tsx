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
              Seven aviation games. Test your recognition, knowledge and speed,
              from the window seat to the captain&apos;s chair.
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
              <strong>Seven ways to test your knowledge</strong>
              <small>Recognition, matching and word games</small>
            </div>
          </div>
          <div>
            <Medal size={29} />
            <div>
              <strong>Every Flight is a new challenge</strong>
              <small>Ten Flights make one Trip</small>
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
              <h2>Find your kind of challenge.</h2>
              <p>
                Know the shape of a 747? The code for Heathrow? There&apos;s a
                game for that.
              </p>
            </div>
            <Link href="/games" className="text-link">
              All seven games <ArrowUpRight size={18} />
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
