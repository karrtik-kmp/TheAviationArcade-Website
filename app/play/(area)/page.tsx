import { requireArea } from "@/lib/access";
import { playerProfile } from "@/lib/player-mock";
import { accountSignOutPath } from "@/lib/account";
import { SiteLink } from "@/components/SiteLink";

export const dynamic = "force-dynamic";
export const metadata = { title: "Player profile" };

const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function PlayPage() {
  const access = await requireArea("player");
  if (access.kind !== "granted") return null;
  const { user, principal } = access.viewer;
  const profile = playerProfile({
    userId: user.userId,
    displayName: principal.displayName,
  });
  return (
    <main id="main" className="account-page">
      <section className="account-hero">
        <span className="eyebrow">Sample player data · sample name tag</span>
        <h1>{profile.nameTag}</h1>
        <p>
          {profile.rankTitle} · {profile.skillPoints.toLocaleString("en")}{" "}
          Status Points. These stats and recent games are examples, not your app
          activity. Player profile linking is coming soon. When it’s available,
          we’ll use your existing Callsign; we won’t create a new one.
        </p>
      </section>
      <dl className="player-stats">
        <div>
          <dt>Games played</dt>
          <dd>{profile.gamesPlayed}</dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd>{profile.bestStreak}</dd>
        </div>
        <div>
          <dt>App profile link</dt>
          <dd>Linking coming soon</dd>
        </div>
      </dl>
      <div className="account-destinations">
        <section className="account-destination">
          <span className="eyebrow">Recent games</span>
          <h2>Last played</h2>
          <ul className="player-recent">
            {profile.recent.map((entry) => (
              <li key={entry.gameSlug}>
                <SiteLink href={`/games/${entry.gameSlug}`}>
                  {entry.gameName}
                </SiteLink>
                <span>
                  {entry.score.toLocaleString("en")} ·{" "}
                  {date.format(new Date(entry.playedAt))}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="account-destination">
          <span className="eyebrow">Account</span>
          <h2>{principal.displayName}</h2>
          <p>
            Your website account is separate from your Airplane Games app
            profile. Linking is coming soon.
          </p>
          <SiteLink className="text-link" href="/account">
            Account options
          </SiteLink>
          <SiteLink
            className="text-link"
            href={accountSignOutPath()}
            target="_top"
          >
            Sign out
          </SiteLink>
        </section>
      </div>
    </main>
  );
}
