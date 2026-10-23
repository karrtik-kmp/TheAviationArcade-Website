import { AuthForm } from "@/components/AuthForm";
import { PublicShell } from "@/components/PublicShell";
import { audiences, safeAccountReturn, type Audience } from "@/lib/account";
import { redirectIfSignedIn } from "@/lib/access";

export type SignInSearchParams = Promise<{
  return_to?: string | string[];
}>;

/** The sign-in page for one audience. Each area's `sign-in/page.tsx` is just this. */
export async function SignInRoute({
  audience,
  searchParams,
}: {
  audience: Audience;
  searchParams: SignInSearchParams;
}) {
  const params = await searchParams;
  const value = Array.isArray(params.return_to)
    ? params.return_to[0]
    : params.return_to;
  const safe = safeAccountReturn(value);
  const returnTo = safe === "/" ? audiences[audience].home : safe;
  await redirectIfSignedIn(audience, returnTo);
  return (
    <PublicShell>
      <main id="main" className="auth-page">
        <AuthForm audience={audience} returnTo={returnTo} />
      </main>
    </PublicShell>
  );
}
