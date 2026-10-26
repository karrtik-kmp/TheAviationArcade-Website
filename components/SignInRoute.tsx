import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { Brand, ThemeToggle } from "@/components/PublicShell";
import { SiteLink } from "@/components/SiteLink";
import { sitePath } from "@/lib/paths";
import {
  audienceFor,
  audiences,
  isCommunityRole,
  safeAccountReturn,
  signInPath,
  type Audience,
} from "@/lib/account";
import { redirectIfSignedIn } from "@/lib/access";
import "@/components/account.css";
import "@/components/admin-sign-in.css";
import "@/components/community-sign-in.css";

export type SignInSearchParams = Promise<{
  return_to?: string | string[];
  as?: string | string[];
}>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** The safe app path to land on for `audience`, defaulting to its home. */
function landing(audience: Audience, value: string | undefined) {
  const safe = safeAccountReturn(value);
  return safe === "/" ? audiences[audience].home : safe;
}

/** /admin/sign-in: the editors' own page, framed like the workspace rather than the public site. */
export async function AdminSignInRoute({
  searchParams,
}: {
  searchParams: SignInSearchParams;
}) {
  const returnTo = landing("admin", first((await searchParams).return_to));
  await redirectIfSignedIn("admin", returnTo);
  return (
    <div className="admin-signin">
      <aside className="admin-signin-panel">
        <Brand />
        <div className="admin-signin-copy">
          <p className="eyebrow">Editorial workspace</p>
          <h2>Review photo proposals and publish the collection.</h2>
          <ul>
            <li>Authorized staff accounts only</li>
            <li>The shared demo account is view only</li>
            <li>Every editorial change is recorded</li>
          </ul>
        </div>
        <SiteLink className="admin-signin-back" href="/">
          ← Back to the website
        </SiteLink>
      </aside>
      <main id="main" className="admin-signin-main">
        <AuthForm audience="admin" returnTo={returnTo} />
      </main>
    </div>
  );
}

/**
 * /sign-in: the public community account entry. Destination context is retained
 * for legacy links, while the form never asks visitors to choose a role.
 */
export async function CommunitySignInRoute({
  searchParams,
}: {
  searchParams: SignInSearchParams;
}) {
  const params = await searchParams;
  const value = first(params.return_to);
  const requested = first(params.as);
  const owner = audienceFor(safeAccountReturn(value));
  // Old links to /sign-in?return_to=/admin… belong on the editors' page.
  if (!isCommunityRole(requested) && owner === "admin")
    redirect(signInPath("admin", value));
  const role = isCommunityRole(requested)
    ? requested
    : owner === "admin"
      ? "player"
      : owner;
  const returnTo = value !== undefined
    ? safeAccountReturn(value)
    : isCommunityRole(requested)
      ? audiences[role].home
      : "/";
  await redirectIfSignedIn(role, returnTo);
  return (
    <div className="community-signin-page">
      <a className="skip" href="#main">Skip to content</a>
      <header className="community-signin-header">
        <Brand />
        <div className="community-signin-header-actions">
          <ThemeToggle />
          <SiteLink href="/">Back to website</SiteLink>
        </div>
      </header>
      <main id="main" className="community-signin-main">
        <figure className="community-signin-photo">
          <img src={sitePath("/media/hero.webp")} srcSet={`${sitePath("/media/hero-640.webp")} 640w, ${sitePath("/media/hero.webp")} 1440w`} sizes="(max-width: 767px) 100vw, 54vw" alt="Aircraft photographed against the sky" fetchPriority="high" />
        </figure>
        <div className="community-signin-form">
          <AuthForm audience={role} returnTo={returnTo} />
          <nav className="community-signin-legal" aria-label="Legal">
            <SiteLink href="/review-conditions">Review conditions</SiteLink>
            <SiteLink href="/privacy">Privacy</SiteLink>
          </nav>
        </div>
      </main>
    </div>
  );
}
