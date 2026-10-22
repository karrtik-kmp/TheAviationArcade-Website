import { AccountPage } from "@/components/AccountPage";
import { PublicShell } from "@/components/PublicShell";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AccountRoute({ searchParams }: PageProps) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  return (
    <PublicShell>
      <AccountPage
        signedOutReturn={first(params.signed_out) === "1"}
        verificationNotice={first(params.verify_email) === "1"}
        verificationSendFailed={first(params.verification_error) === "1"}
        returnTo={first(params.return_to)}
      />
    </PublicShell>
  );
}
