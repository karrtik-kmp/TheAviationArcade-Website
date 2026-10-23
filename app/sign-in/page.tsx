import { redirect } from "next/navigation";
import { accountSignInPath } from "@/lib/account";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ return_to?: string | string[] }> };

/** Old shared entry point: forwards to the sign-in page of the area `return_to` belongs to. */
export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const value = Array.isArray(params.return_to)
    ? params.return_to[0]
    : params.return_to;
  redirect(accountSignInPath(value ?? "/account"));
}
