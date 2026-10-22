import type { AnchorHTMLAttributes } from "react";
/** Native navigation avoids Vinext beta's broken production RSC prefetch path. */
export function SiteLink(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
