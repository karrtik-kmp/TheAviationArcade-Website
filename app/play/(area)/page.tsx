import { currentPrincipal, requireArea } from "@/lib/access";
import { accountSignInPath, accountSignOutPath } from "@/lib/account";
import { SiteLink } from "@/components/SiteLink";
import { progressSource } from "@/lib/progress/worker";
import { rankName, type ProgressState } from "@/lib/progress/source";

export const dynamic = "force-dynamic";
export const metadata = { title: "Player profile" };

const number = (n: number) => n.toLocaleString("en");

/** What the page says when there is no progress to show. Never a made-up rank. */
function notice(state: Exclude<ProgressState, { kind: "progress" }>) {
  switch (state.kind) {
    case "no-player":
      return { title: "No app progress yet", text: "This account has no progress in the Airplane Games app yet." };
    case "signed-out":
      return { title: "Sign in again", text: "Your session has expired. Sign in again to see your progress." };
    case "unavailable":
      return {
        title: "Progress unavailable",
        text:
          state.retryAfter !== undefined
            ? `Your progress could not be loaded. Try again in ${number(Math.max(1, Math.ceil(state.retryAfter)))} seconds.`
            : "Your progress could not be loaded. Please try again later.",
      };
    case "not-connected":
      return { title: "Not connected", text: "This website is not connected to the game service yet." };
  }
}

export default async function PlayPage() {
  const access = await requireArea("player");
  if (access.kind !== "granted") return null;
  const { principal } = access.viewer;
  const member = await currentPrincipal();
  const state: ProgressState =
    member.kind === "member" ? await progressSource().read(member) : { kind: "signed-out" };

  return (
    <main id="main" className="account-page">
      {state.kind === "progress" ? (
        <>
          <section className="account-hero">
            <span className="eyebrow">{state.sample ? "Sample progress · not your app activity" : "Your progress"}</span>
            <h1>{rankName(state.progress.activeRank)}</h1>
            <p>
              {number(state.progress.statusPoints)} Status Points
              {state.progress.pleasureCruise
                ? ` · Certified ${rankName(state.progress.certifiedRank)}, flying a lower rank`
                : ""}
              {state.progress.nextRank
                ? ` · ${rankName(state.progress.nextRank.rank)} at ${number(state.progress.nextRank.statusPoints)}`
                : ""}
            </p>
          </section>
          <dl className="player-stats">
            <div>
              <dt>Miles</dt>
              <dd>{number(state.progress.miles)}</dd>
            </div>
            <div>
              <dt>Co-Pilot hints</dt>
              <dd>{number(state.progress.hints)}</dd>
            </div>
            <div>
              <dt>Perfect Streak</dt>
              <dd>{number(state.progress.perfectStreak)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <section className="account-hero" role={state.kind === "unavailable" ? "status" : undefined}>
          <span className="eyebrow">Player profile</span>
          <h1>{notice(state).title}</h1>
          <p>{notice(state).text}</p>
          {state.kind === "signed-out" && (
            <SiteLink className="text-link" href={accountSignInPath("/play")} target="_top">
              Sign in
            </SiteLink>
          )}
        </section>
      )}
      <div className="account-destinations">
        <section className="account-destination">
          <span className="eyebrow">Account</span>
          <h2>{principal.displayName}</h2>
          <SiteLink className="text-link" href="/account">
            Account options
          </SiteLink>
          <SiteLink className="text-link" href={accountSignOutPath()} target="_top">
            Sign out
          </SiteLink>
        </section>
      </div>
    </main>
  );
}
