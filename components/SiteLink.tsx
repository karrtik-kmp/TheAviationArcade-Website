import type { AnchorHTMLAttributes } from "react";
import { sitePath } from "@/lib/paths";
/**
 * Native navigation avoids Vinext beta's broken production RSC prefetch path.
 * `href` is an app path; the site's base path is added here.
 */
export function SiteLink({
  href,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href === undefined ? href : sitePath(href)} />;
}
