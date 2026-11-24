import { AuthForm } from "@/components/AuthForm";
import { Brand, ThemeToggle } from "@/components/PublicShell";
import { SiteLink } from "@/components/SiteLink";
import { sitePath } from "@/lib/paths";
import {
  audienceFor,
  audiences,
  isCommunityRole,
  safeAccountReturn,
} from "@/lib/account";
import { redirectIfSignedIn } from "@/lib/access";
import "@/components/account.css";
import "@/components/community-sign-in.css";

export type SignInSearchParams = Promise<{
  return_to?: string | string[];
  as?: string | string[];
}>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

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
  const role = isCommunityRole(requested) ? requested : owner;
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
            <SiteLink href="/photo-submission-policy">Photo Submission Policy</SiteLink>
            <SiteLink href="/privacy">Privacy Policy</SiteLink>
            <SiteLink href="/terms">Terms of Service</SiteLink>
          </nav>
        </div>
      </main>
    </div>
  );
}
