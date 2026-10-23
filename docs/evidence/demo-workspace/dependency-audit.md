# Dependency audit at demo deployment

2026-10-23, runtime source checkpoint `feb4cba`. `npm audit --omit=dev` reported nine
inherited package advisories: one critical, six high and two moderate. The demo change
adds no dependencies and does not change the lockfile. Raw local output is ignored at
`outputs/demo-runtime-audit.json`.

Reachability triage for this Cloudflare build:

- **Next.js / sharp:** the deployed entry is `vinext/server/fetch-handler`, not a Next.js
  Node server. App imports use Vinext's navigation/headers shims. There are no app imports
  of `next/image`, `next/og`, or `next/server`, and no `use cache` functions. The generated
  Worker/SSR modules contain no Next server implementation, ImageResponse, or sharp module
  import (the word “sharp” occurs only in photographer instructions). The
  [SVG optimization advisory](https://github.com/advisories/GHSA-2464-fhr4-w9xw) and
  [sharp advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) concern an image-decoding
  path on glibc-based Linux. The
  [typed-array cache advisory](https://github.com/advisories/GHSA-673q-mjm6-r5xr) concerns
  affected cache functions. Those paths were not found in this Worker build.
- **Firebase / Firestore / gRPC:** the app imports Firebase App and Auth only. There is no
  Firestore import or gRPC server/client implementation in the generated Worker modules.
  The two gRPC advisories describe TLS auth-context handling and server-handler errors;
  neither is used by this Firebase Auth integration.
- **source-map-js, fast-uri, baseline-browser-mapping:** no corresponding module import or
  implementation was found in generated Worker modules. These remain installed dependency/
  build-tool inventory findings. The site does not accept uploaded source maps or build config.

This is a source/bundle reachability assessment, not exploit testing or a claim that the
dependency inventory is clean. Dependency updates are deferred to a separate compatibility
checkpoint because Vinext is pinned to a beta framework integration and the audit's proposed
Firebase remedy is a major downgrade. Review by **2026-10-30**, and before a production-domain
launch. Re-evaluate immediately if Next's server, image optimization, cache components,
Firestore, gRPC, or untrusted build inputs are introduced.
