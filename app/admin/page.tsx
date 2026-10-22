import { AdminApp } from "@/components/AdminApp";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { isStaff } from "@/lib/server";
import { PublicShell, Brand } from "@/components/PublicShell";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <PublicShell>
        <main id="main" className="admin-gate">
          <div className="admin-gate-card">
            <Brand />
            <h1>Editor sign in</h1>
            <p>Sign in with ChatGPT to access the editorial workspace.</p>
            <a
              className="btn"
              href="/signin-with-chatgpt?return_to=%2Fadmin"
              target="_top"
            >
              {process.env.NODE_ENV !== "production"
                ? "Try demo editor"
                : "Sign in with ChatGPT"}
            </a>
            {process.env.NODE_ENV !== "production" && (
              <p className="admin-local-note">
                Local demo account: <b>seedy@sites.test</b>. No password is
                required. Hosted access checks the staff allowlist.
              </p>
            )}
          </div>
        </main>
      </PublicShell>
    );
  }

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
          </div>
        </main>
      </PublicShell>
    );
  }

  return (
    <AdminApp user={{ displayName: user.displayName, email: user.email }} />
  );
}
