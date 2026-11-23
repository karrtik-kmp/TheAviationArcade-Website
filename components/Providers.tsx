"use client";
import { ThemeProvider } from "next-themes";
import { AccountSessionProvider } from "@/components/AccountSession";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem>
      <AccountSessionProvider>{children}</AccountSessionProvider>
    </ThemeProvider>
  );
}
