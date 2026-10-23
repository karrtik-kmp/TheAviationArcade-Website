import { SignInRoute, type SignInSearchParams } from "@/components/SignInRoute";

export const dynamic = "force-dynamic";

export default function PhotographerSignInPage(props: {
  searchParams: SignInSearchParams;
}) {
  return <SignInRoute audience="photographer" {...props} />;
}
