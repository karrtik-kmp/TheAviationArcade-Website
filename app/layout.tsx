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
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
