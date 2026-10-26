import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { PublicShell, Brand } from "@/components/PublicShell";
import { SiteLink } from "@/components/SiteLink";
import {
  audienceFor,
  audiences,
  communityRoles,
  isCommunityRole,
  safeAccountReturn,
  signInPath,
  type Audience,
} from "@/lib/account";
import { redirectIfSignedIn } from "@/lib/access";
import "@/components/account.css";
import "@/components/admin-sign-in.css";

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
 * /sign-in: photographers and players share this page and choose their role.
 * The role comes from `as`, else from the area `return_to` belongs to.
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
  const returnTo = landing(role, value);
  await redirectIfSignedIn(role, returnTo);
  return (
    <PublicShell>
      <main id="main" className="auth-page">
        <AuthForm audience={role} returnTo={returnTo} roles={communityRoles} />
      </main>
    </PublicShell>
  );
}
