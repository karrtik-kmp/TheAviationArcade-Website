import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The URL prefix the site is served under, e.g. "/aviation-arcade". Empty
  // serves from the root. Links, redirects and fetches all derive from this
  // through lib/paths.ts — never hardcode the prefix anywhere else.
  basePath: process.env.SITE_BASE_PATH ?? "",
};

export default nextConfig;
