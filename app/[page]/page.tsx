import { SiteLink as Link } from "@/components/SiteLink";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
const pages: Record<
  string,
  { title: string; intro: string; sections: { title: string; body: string }[] }
> = {
  "get-the-app": {
    title: "Your next Trip is on the horizon.",
    intro:
      "Airplane Games is in development for mobile. Verified download links will appear here when a public release is ready.",
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
    title: "For people who look up.",
    intro:
      "Airplane Games brings recognition, knowledge, speed and memory together in an aviation arcade.",
    sections: [
      {
        title: "An arcade with a common thread",
        body: "Eight games explore civil and military aircraft, airline tails, airports, runway layouts, callsigns and airport codes. Status Points and a shared rank ladder connect them as you progress in the app.",
      },
      {
        title: "A community behind the collection",
        body: "Photographers can propose aircraft, airport, ATC and other aviation images. Editors check facts, image quality, credit and rights before any proposed use.",
      },
    ],
  },
  "how-to-play": {
    title: "A little knowledge. A new perspective.",
    intro:
      "The games are played in the mobile app. This website is where you read about them, review your progress and join the community.",
    sections: [
      {
        title: "Ranks and Status Points",
        body: "Status Points measure lifetime progress through Trainee, First Officer, Captain, Check Airman and Chief Pilot. Every game, including the military edition of Aircraft Identifier, uses the same five ranks. The app remains the source of truth for awards and rank rules.",
      },
      {
        title: "Review your progress",
        body: "Signed-in players will be able to review their profile and stats here once app profile linking is available. Nothing on this website is played or purchased.",
      },
      {
        title: "Join the community",
        body: "A community forum is planned for players and photographers to talk aviation. Details will appear here when it opens.",
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
        body: "The review site is private. ChatGPT sign-in protects this preview and staff permissions are checked on the server. This identity is separate from the planned mobile game's player accounts. Public retention and deletion policies are not finalized.",
      },
    ],
  },
};
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
          <h1>{data.title}</h1>
          <p>{data.intro}</p>
        </header>
        <article className="wrap prose">
          {data.sections.map((s) => (
            <section key={s.title}>
              <h2>{s.title}</h2>
              <p>{s.body}</p>
            </section>
          ))}
          <div className="actions" style={{ marginTop: 36 }}>
            <Link className="btn" href="/games">
              Explore games
            </Link>
            <Link className="btn secondary" href="/contribute">
              Share a photo
            </Link>
          </div>
        </article>
      </main>
    </PublicShell>
  );
}
