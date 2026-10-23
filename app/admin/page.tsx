import { AdminApp } from "@/components/AdminApp";
import { getProductUser } from "@/lib/product-auth";
import { isStaff } from "@/lib/server";
import { PublicShell, Brand } from "@/components/PublicShell";
import { accountSessionKey } from "@/lib/account-server";
import { accountSignInPath, accountSignOutPath } from "@/lib/account";
import { isDemoPrincipal } from "@/lib/demo-server";
import { redirect } from "next/navigation";
import { SiteLink } from "@/components/SiteLink";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getProductUser();

  if (!user) {
    return (
      <PublicShell>
        <main id="main" className="admin-gate">
          <div className="admin-gate-card">
            <Brand />
            <h1>Editor sign in</h1>
            <p>
              Sign in with your email or Google account to access the editorial
              workspace.
            </p>
            <a className="btn" href={accountSignInPath("/admin")} target="_top">
              Sign in
            </a>
          </div>
        </main>
      </PublicShell>
    );
  }

  const displayName = user.fullName?.trim() || "Account";
  if (isDemoPrincipal(user)) redirect("/demo");
  if (!(await isStaff())) {
    return (
      <PublicShell>
        <main id="main" className="admin-gate">
          <div className="admin-gate-card" role="alert">
            <p className="eyebrow">Airplane Games</p>
            <h1>Access unavailable</h1>
            <p>
              This account does not have permission to use the editorial
              workspace.
            </p>
            <p>Signed in as {displayName}.</p>
            <div className="admin-gate-actions">
              <SiteLink className="btn secondary" href="/account">
                Account options
              </SiteLink>
              <a className="btn" href={accountSignOutPath()} target="_top">
                Sign out
              </a>
            </div>
          </div>
        </main>
      </PublicShell>
    );
  }

  return (
    <AdminApp user={{ sessionKey: await accountSessionKey(user.userId) }} />
  );
}
