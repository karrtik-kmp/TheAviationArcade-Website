import { SignInRoute, type SignInSearchParams } from "@/components/SignInRoute";

export const dynamic = "force-dynamic";

export default function AdminSignInPage(props: {
  searchParams: SignInSearchParams;
}) {
  return <SignInRoute audience="admin" {...props} />;
}
