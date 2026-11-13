"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { currentAdminWorkspaceUrl } from "@/lib/admin-site";

const subscribe = () => () => {};

/**
 * The Admin's address for this website's host, or null on the server and on local hosts. Read after
 * hydration (server snapshot null), so the server and first client render agree.
 */
export function useAdminWorkspaceUrl(): string | null {
  return useSyncExternalStore(subscribe, currentAdminWorkspaceUrl, () => null);
}

/**
 * A link to the editors' workspace on the Admin host. Rendered only when the caller already knows the
 * account is staff and the Admin's address is known; the Admin checks roles again on arrival.
 */
export function AdminWorkspaceLink({
  className,
  onClick,
  children,
}: {
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const href = useAdminWorkspaceUrl();
  if (!href) return null;
  return (
    <a className={className} href={href} onClick={onClick}>
      {children}
    </a>
  );
}
