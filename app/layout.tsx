import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { sitePath } from "@/lib/paths";

export const metadata: Metadata = {
  title: {
    default: "Airplane Games | The Aviation Arcade",
    template: "%s | Airplane Games",
  },
  description:
    "Discover eight aviation games, explore Plane of the Day, and share your aviation photography.",
  robots: { index: false, follow: false },
  icons: {
    icon: sitePath("/media/favicon.png"),
  },
};

/**
 * Cookie consent: the client's Termageddon + Usercentrics embed (2026-11-24). Termageddon's translations,
 * then the Usercentrics banner loader with the client's settings id, as in the embed code.
 */
const consentLoader = [
  "window.uc&&uc.setCustomTranslations('https://termageddon.ams3.cdn.digitaloceanspaces.com/translations/');",
  "(function(){var s=document.createElement('script');s.id='usercentrics-cmp';",
  "s.src='https://app.usercentrics.eu/browser-ui/latest/loader.js';",
  "s.setAttribute('data-settings-id','U4rmjBh4mHjiQf');s.async=true;document.head.appendChild(s);})();",
].join("");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href={sitePath("/fonts/BarlowCondensed-SemiBold.woff2")}
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          as="font"
          type="font/woff2"
          href={sitePath("/fonts/Poppins-Regular.woff2")}
          crossOrigin="anonymous"
        />
        {/* The consent blocker is the first script, so it can hold back cookie-setting scripts until the
            visitor consents. It is also React's last <head> node: Usercentrics inserts its own scripts
            after it before React hydrates, and nodes after React's last one don't break hydration. */}
        <link rel="preconnect" href="//privacy-proxy.usercentrics.eu" />
        <link rel="preload" href="//privacy-proxy.usercentrics.eu/latest/uc-block.bundle.js" as="script" />
        <script src="https://privacy-proxy.usercentrics.eu/latest/uc-block.bundle.js" />
      </head>
      <body>
        {/* The banner loader starts from here for the same hydration reason. */}
        <script dangerouslySetInnerHTML={{ __html: consentLoader }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
