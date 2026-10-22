import { PublicShell } from "@/components/PublicShell";
import SubmissionForm from "@/components/SubmissionForm";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    category?: string | string[];
    game?: string | string[];
  }>;
};

export default async function ContributePage({ searchParams }: PageProps) {
  const [user, params] = await Promise.all([getChatGPTUser(), searchParams]);
  const category = Array.isArray(params.category)
    ? params.category[0]
    : params.category;
  const game = Array.isArray(params.game) ? params.game[0] : params.game;

  return (
    <PublicShell>
      <SubmissionForm
        user={
          user ? { displayName: user.displayName, email: user.email } : null
        }
        initialCategory={category}
        initialGame={game}
        demoMode={process.env.NODE_ENV !== "production"}
      />
    </PublicShell>
  );
}
