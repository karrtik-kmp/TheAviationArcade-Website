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
/** The homepage's three games and their teaser copy (client, website notes 1). */
const homeGames = [
  {
    slug: "aircraft-identifier",
    teaser: {
      title: "Can you name that plane?",
      text: "Boeing or Airbus? Jumbo jet or regional aircraft? Take a closer look and see if you can identify the aircraft.",
    },
  },
  {
    slug: "airport-spotter",
    teaser: {
      title: "Where in the world are you?",
      text: "From famous international hubs to hidden aviation gems, see how many airports you can recognize.",
    },
  },
  {
    slug: "runway-identifier",
    teaser: {
      title: "Every airport leaves a footprint.",
      text: "Study the runway layout, look for the clues, and figure out which airport you're looking at.",
    },
  },
];
export default function Home() {
  return (
    <PublicShell>
      <main id="main">
        <section className="wrap hero">
          <div className="hero-copy reveal">
            <span className="eyebrow">Welcome aboard</span>
            <h1>Ready for Takeoff?</h1>
            <p className="page-subheading">
              Think you know airplanes? Let&apos;s find out!
            </p>
            <p>
              From jumbo jets to airport codes, airline tails to runway layouts,
              Airplane Games brings the excitement of aviation to your
              fingertips.
            </p>
            <p>
              Test your knowledge, challenge yourself, collect points, and climb
              the ranks from Trainee to Chief Pilot.
            </p>
            <p>
              Whether you&apos;re a lifelong aviation enthusiast or just love
              watching planes take off, there&apos;s a game with your name on
              it.
            </p>
            <div className="actions">
              <Link href="/games" className="btn">
                Explore the Games <ArrowUpRight size={18} />
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
              <span>Prepare for Takeoff</span>
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
              <span className="eyebrow">Fasten your seat belts</span>
              <h2>Eight Games. A World of Aviation Fun.</h2>
              <p>
                Think you can spot a Boeing 747 from a mile away? Know your
                airport codes? Recognize an airline by the tip of its tail?
              </p>
              <p>It&apos;s time to put that knowledge to work!</p>
              <p>
                Explore eight unique aviation challenges packed with aircraft,
                airports, airlines, and everything in between.
              </p>
            </div>
            <Link href="/games" className="text-link">
              Explore All Eight Games <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="game-grid home-games">
            {homeGames.map(({ slug, teaser }) => {
              const g = games.find((x) => x.slug === slug)!;
              return <GameCard key={g.id} game={g} teaser={teaser} />;
            })}
          </div>
        </section>
        {/* Placeholder for the client's "Can you identify this plane?" video (ruling
            2026-11-23): a picture, a 3-2-1 countdown, the answer. Swap the frame for a
            <video> once the client supplies it. */}
        <section className="wrap section video-teaser" aria-labelledby="video-teaser-title">
          <h2 id="video-teaser-title">Can you identify this plane?</h2>
          <div className="video-placeholder">
            <AirplaneTilt size={56} weight="duotone" aria-hidden="true" />
            <p>Video coming soon</p>
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
              <span className="eyebrow">Calling all aviation photographers</span>
              <h2>Share Your View From the Flight Line.</h2>
              <p>
                Your photography may be considered for our Plane of the Day
                feature, aviation galleries, or future game content.
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
