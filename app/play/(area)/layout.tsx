import type { ReactNode } from "react";
import { PublicShell } from "@/components/PublicShell";
import { requireArea } from "@/lib/access";

export const dynamic = "force-dynamic";

/** The player area. Signed-out visitors are sent to /sign-in?as=player. */
export default async function PlayLayout({ children }: { children: ReactNode }) {
  await requireArea("player");
  return <PublicShell>{children}</PublicShell>;
}
