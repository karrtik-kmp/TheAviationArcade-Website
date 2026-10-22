import { AuthForm } from "@/components/AuthForm";
import { PublicShell } from "@/components/PublicShell";
import { safeAccountReturn } from "@/lib/account";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ return_to?: string | string[] }> };

export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const value = Array.isArray(params.return_to)
    ? params.return_to[0]
    : params.return_to;
  return (
    <PublicShell>
      <main id="main" className="auth-page">
        <AuthForm returnTo={safeAccountReturn(value)} />
      </main>
    </PublicShell>
  );
}
