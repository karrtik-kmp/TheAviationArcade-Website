import { getProductUser } from "@/lib/product-auth";
import { accountSessionKey } from "@/lib/account-server";
import { accountSignInPath } from "@/lib/account";
import { PublicShell } from "@/components/PublicShell";
import { DemoWorkspace } from "@/components/DemoWorkspace";

export const dynamic = "force-dynamic";
export default async function DemoPage() {
  const user = await getProductUser();
  return <PublicShell>{user
    ? <DemoWorkspace sessionKey={await accountSessionKey(user.userId)} />
    : <main id="main" className="account-page"><section className="account-panel">
        <span className="eyebrow">Airplane Games preview</span>
        <h1>Explore the demo</h1>
        <p>Sign in to inspect game settings and prefilled sample content.</p>
        <a className="btn" href={accountSignInPath("/demo")} target="_top">Sign in to demo</a>
      </section></main>}
  </PublicShell>;
}
