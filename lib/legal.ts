/**
 * The site's legal pages. Privacy, terms, cookies and disclaimer are the client's Termageddon embeds
 * (sent 2026-11-24, one page each); the photo policy is the client's own text in
 * `lib/photo-submission-policy.ts`. Footers and the sign-in page link to these in this order.
 */
export type LegalPage = {
  path: string;
  /** Link text and page title. */
  label: string;
  /** Termageddon policy key; absent for the photo policy, which is rendered from our copy. */
  termageddonKey?: string;
};

export const legalPages: LegalPage[] = [
  { path: "/privacy", label: "Privacy Policy", termageddonKey: "Wlc1VE9GUmhiQ3RRUjNCVFkxRTlQUT09" },
  { path: "/terms", label: "Terms of Service", termageddonKey: "WVVVemRsaGlaVWRpT1Zwc1QzYzlQUT09" },
  { path: "/cookies", label: "Cookie Policy", termageddonKey: "UVZvck4zbFRWbmREUVU5a2VsRTlQUT09" },
  { path: "/disclaimer", label: "Disclaimer", termageddonKey: "TlZWbVZFRmlVa3MwYWpNNU4zYzlQUT09" },
  { path: "/photo-submission-policy", label: "Photo Submission Policy" },
];

export const legalPageFor = (slug: string) => legalPages.find((p) => p.path === `/${slug}`);
