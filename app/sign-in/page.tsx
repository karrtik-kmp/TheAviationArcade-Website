import {
  CommunitySignInRoute,
  type SignInSearchParams,
} from "@/components/SignInRoute";

export const dynamic = "force-dynamic";

export default function SignInPage(props: { searchParams: SignInSearchParams }) {
  return <CommunitySignInRoute {...props} />;
}
