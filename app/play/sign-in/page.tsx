import { SignInRoute, type SignInSearchParams } from "@/components/SignInRoute";

export const dynamic = "force-dynamic";

export default function PlayerSignInPage(props: {
  searchParams: SignInSearchParams;
}) {
  return <SignInRoute audience="player" {...props} />;
}
