import { PublicShell } from "@/components/PublicShell";
import { SignOutPage } from "@/components/SignOutPage";

export const dynamic = "force-dynamic";

export default function SignOutRoute() {
  return (
    <PublicShell>
      <SignOutPage />
    </PublicShell>
  );
}
