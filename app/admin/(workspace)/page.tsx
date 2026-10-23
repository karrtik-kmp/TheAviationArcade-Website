import { AdminApp } from "@/components/AdminApp";
import { requireArea } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const access = await requireArea("admin");
  // The layout renders the gate for anyone else.
  if (access.kind !== "granted") return null;
  return (
    <AdminApp
      user={{ sessionKey: access.viewer.sessionKey }}
      readOnly={access.readOnly}
    />
  );
}
