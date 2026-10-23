import type { ReactNode } from "react";
import { PublicShell } from "@/components/PublicShell";
import { requireArea } from "@/lib/access";

export const dynamic = "force-dynamic";

/** The photographer area. Guests see the public landing; the demo account is sent to /admin. */
export default async function ContributeLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireArea("photographer");
  return <PublicShell>{children}</PublicShell>;
}
