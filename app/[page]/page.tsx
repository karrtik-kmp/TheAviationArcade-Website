import { SiteLink as Link } from "@/components/SiteLink";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { ranks } from "@/lib/catalog";
type Section = {
  title: string;
  body: string | string[];
  /** Renders the five-rank ladder with the client's line for each rank. */
  rankLadder?: boolean;
};
type InfoPage = {
  eyebrow?: string;
  title: string;
  /** A heading-style line under the title. */
  subheading?: string;
  intro: string | string[];
  sections: Section[];
  actions?: { primary: string; secondary: string };
};
/** The client's line for each rank (website notes 1, 2026-11). Names come from the catalog. */
const rankLines: Record<
  (typeof ranks)[number]["id"],
  { tagline: string; text: string }
> = {
  trainee: {
    tagline: "Welcome Aboard!",
    text: "You're new to the flight deck, and the adventure is just beginning. Get comfortable, learn the basics, and enjoy your first challenges.",
  },
  "first-officer": {
    tagline: "You're Getting the Hang of This!",
    text: "Your aviation knowledge is growing. You're spotting the differences, recognizing the clues, and getting better with every round.",
  },
  captain: {
    tagline: "You're in Command!",
    text: "You've proven you've got the skills to take charge. But the challenges are getting tougher. Stay sharp!",
  },
  "check-airman": {
    tagline: "Welcome to Expert Territory.",
    text: "You're playing at a whole new altitude. Your knowledge and attention to detail will be put to the ultimate test.",
  },
  "chief-pilot": {
    tagline: "Top of the Flight Deck!",
    text: "You've climbed to the highest rank. That's something to be proud of! Keep playing, improving, and enjoying the world of aviation.",
  },
};
const pages: Record<string, InfoPage> = {
  "get-the-app": {
    eyebrow: "Preparing for departure",
    title: "Your Aviation Adventure Is Almost Ready for Takeoff!",
    intro: [
      "The aircraft are lined up. The challenges are coming together. And we're getting the Aviation Arcade ready for boarding.",
      "Airplane Games is currently in development for mobile devices.",
      "Soon you'll be able to put your aviation knowledge to the test with eight unique games, work your way through five pilot ranks, and discover new reasons to love aviation.",
    ],
    sections: [
      {
        title: "Android first",
        body: "We're building the arcade for Android first. This private website prototype does not distribute a public app release.",
      },
      {
        title: "Explore while we build",
        body: "Get to know the eight planned games, or share aviation photography for the collection. We'll show each game's availability clearly.",
      },
    ],
  },
  about: {
    eyebrow: "The story behind the arcade",
    title: "Built for the Love of Aviation.",
    intro: [
      "There's something magical about airplanes.",
      "Maybe it's the thrill of watching a massive jet lift off the runway. The excitement of seeing an unfamiliar aircraft overhead. Or the satisfaction of recognizing an airport before anyone else.",
      "Whatever draws you to aviation, we get it.",
      "Airplane Games: The Aviation Arcade was created to bring that excitement to your fingertips.",
    ],
    sections: [
      {
        title: "A World of Aviation. One Fun Arcade.",
        body: [
          "Our mission is simple: make aviation fun, engaging, and accessible to everyone.",
          "Through quick, entertaining games, players can discover new aircraft, explore airports around the world, sharpen their knowledge, and challenge themselves to reach new heights.",
          "You don't need to be an expert to start playing. You just need a little curiosity.",
        ],
      },
      {
        title: "Learn a Little. Play a Lot.",
        body: [
          "We believe the best games are the ones that make you smile, keep you thinking, and teach you something along the way.",
          "Every challenge is another chance to discover something about the amazing world of aviation.",
        ],
      },
      {
        title: "More Than Just Games.",
        body: [
          "Airplane Games is also a celebration of the aviation community, from photographers and plane spotters to aviation enthusiasts and future pilots.",
          "Through shared photography, featured aircraft, and a growing collection of aviation experiences, we're building something for everyone who loves to look up.",
        ],
      },
      {
        title: "See You in the Skies!",
        body: "Whether you're here to test your knowledge, discover something new, or simply enjoy a few minutes of aviation fun, we're glad you're aboard.",
      },
    ],
    actions: { primary: "Explore the Games", secondary: "Submit Your Photo" },
  },
  "how-to-play": {
    eyebrow: "The Flight Deck",
    title: "Earn Your Wings. Join the Crew.",
    subheading: "Every Aviation Legend Starts as a Trainee.",
    intro: [
      "You don't need a pilot's license to take off here. Just a little curiosity, a love of aviation, and a willingness to test your skills.",
      "With every game you play, you'll gain experience, sharpen your knowledge, and work your way up the aviation ladder.",
    ],
    sections: [
      {
        title: "Five Ranks. How High Can You Climb?",
        body: [],
        rankLadder: true,
      },
      {
        title: "Play More. Discover More. Keep Climbing.",
        body: "Earn points, build your experience, collect achievements, and see how far your aviation knowledge can take you.",
      },
      {
        title: "Review your progress",
        body: "Signed-in players will be able to review their profile and stats here once app profile linking is available. Nothing on this website is played or purchased.",
      },
      {
        title: "Aviation Is Better Together.",
        body: [
          "Plane spotters. Aviation enthusiasts. Frequent flyers. Future pilots. We're building a place for everyone who shares the excitement of flight.",
          "Come for the games. Stay for the community.",
        ],
      },
    ],
  },
  "review-conditions": {
    title: "Share for review. Keep your copyright.",
    intro:
      "This private prototype accepts proposals for editorial review. Publication terms are still being finalized.",
    sections: [
      {
        title: "Permission to review",
        body: "Submit only photographs you created or are authorized to share for private review. A proposal does not transfer copyright or grant a public publishing license. Do not upload material you cannot lawfully share.",
      },
      {
        title: "Proposed uses need separate clearance",
        body: "Choosing a game, gallery or Plane of the Day describes where an image might fit. Editors must separately verify the facts and appropriate permission before publication. Approval and publication are separate actions.",
      },
      {
        title: "What editors verify",
        body: "The review covers subject identity, image quality, photographer credit, documented usage rights and category fit. Editors may request changes or reject a proposal with a reason. AI-generated imagery cannot be approved as factual game photography.",
      },
    ],
  },
  privacy: {
    title: "Your proposal stays in the review workflow.",
    intro:
      "A plain-language data notice for this private prototype. A final production privacy policy is still required before public launch.",
    sections: [
      {
        title: "What is stored",
        body: "A proposal stores the photograph, identification details, requested credit, contact email, proposed uses, review notes and status. Files and records are stored on the server; the contact email is not displayed in the public collection.",
      },
      {
        title: "Who can see it",
        body: "Your signed-in account can view its own proposals. Authorized editors can access the review queue. The public collection receives only approved, published fields and credited photographs, never private email or license evidence.",
      },
      {
        title: "Prototype access",
        body: "You can browse this website without signing in. Email/password and Google sign-in through Firebase are used for account features and photo submissions. Staff permissions are checked on the server. App account linking is not yet available. Public retention and deletion policies are not finalized.",
      },
    ],
  },
};
const paragraphs = (body: string | string[]) =>
  typeof body === "string" ? [body] : body;
export default async function InformationPage({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  const data = pages[page];
  if (!data) notFound();
  return (
    <PublicShell>
      <main id="main">
        <header className="wrap page-intro">
          {data.eyebrow && <span className="eyebrow">{data.eyebrow}</span>}
          <h1>{data.title}</h1>
          {data.subheading && (
            <p className="page-subheading">{data.subheading}</p>
          )}
          {paragraphs(data.intro).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </header>
        <article className="wrap prose">
          {data.sections.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              {paragraphs(s.body).map((p) => (
                <p key={p}>{p}</p>
              ))}
              {s.rankLadder && (
                <ol className="rank-ladder">
                  {ranks.map((r) => (
                    <li key={r.id}>
                      <h3>
                        {r.name} — {rankLines[r.id].tagline}
                      </h3>
                      <p>{rankLines[r.id].text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
          <div className="actions" style={{ marginTop: 36 }}>
            <Link className="btn" href="/games">
              {data.actions?.primary ?? "Explore games"}
            </Link>
            <Link className="btn secondary" href="/contribute">
              {data.actions?.secondary ?? "Share a photo"}
            </Link>
          </div>
        </article>
      </main>
    </PublicShell>
  );
}
