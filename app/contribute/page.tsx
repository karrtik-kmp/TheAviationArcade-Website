import { PublicShell } from "@/components/PublicShell";
import SubmissionForm from "@/components/SubmissionForm";
import { getProductUser } from "@/lib/product-auth";
import { accountSessionKey } from "@/lib/account-server";
import { isDemoPrincipal } from "@/lib/demo-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    category?: string | string[];
    game?: string | string[];
    view?: string | string[];
  }>;
};

export default async function ContributePage({ searchParams }: PageProps) {
  const [user, params] = await Promise.all([getProductUser(), searchParams]);
  if (isDemoPrincipal(user)) redirect("/demo");
  const category = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const game = Array.isArray(params.game) ? params.game[0] : params.game;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const sessionKey = user ? await accountSessionKey(user.userId) : null;

  return (
    <PublicShell>
      <SubmissionForm
        user={
          user
            ? {
                displayName: user.fullName?.trim() || "Account",
                email: user.email,
                sessionKey: sessionKey!,
              }
            : null
        }
        initialCategory={category}
        initialGame={game}
        initialView={view === "mine" ? "mine" : "new"}
        demoMode={process.env.NODE_ENV !== "production"}
      />
    </PublicShell>
  );
}
