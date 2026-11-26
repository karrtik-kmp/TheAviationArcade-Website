"use client";
import { SiteLink as Link } from "@/components/SiteLink";
import { AdminWorkspaceLink } from "@/components/AdminWorkspaceLink";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, List, X, ArrowUpRight } from "@phosphor-icons/react";
import { AccountControl } from "@/components/AccountControl";
import { useAccountSession } from "@/components/AccountSession";
import "@/components/account.css";
import { sitePath } from "@/lib/paths";
import { legalPages } from "@/lib/legal";
import { CookieSettingsButton } from "@/components/PolicyEmbed";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Airplane Games home">
      <img src={sitePath("/media/logo-192.webp")} alt="" width="60" height="60" />
      <div className="brand-name">
        Airplane Games
        <span className="brand-descriptor">The Aviation Arcade</span>
      </div>
    </Link>
  );
}
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={
        mounted && resolvedTheme === "dark"
          ? "Use light theme"
          : "Use dark theme"
      }
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? (
        <Sun size={18} />
      ) : (
        <Moon size={18} />
      )}
    </button>
  );
}
const nav = [
  ["/games", "Games"],
  ["/plane-of-the-day", "Plane of the Day"],
  ["/contribute", "Photographers"],
];
export function PublicShell({ children }: { children: React.ReactNode }) {
  const current = usePathname(),
    [open, setOpen] = useState(false),
    { account } = useAccountSession();
  useEffect(() => setOpen(false), [current]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap header-inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Main navigation">
            {nav.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                aria-current={current === href ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <ThemeToggle />
            <AccountControl />
            <Link className="btn" href="/get-the-app">
              App release details <ArrowUpRight size={15} />
            </Link>
            <button
              className="icon-button mobile-menu-button"
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={20} /> : <List size={20} />}
            </button>
          </div>
        </div>
        {open && (
          <nav
            id="mobile-nav"
            className="mobile-nav"
            aria-label="Mobile navigation"
          >
            {[
              ...nav,
              ["/marketplace", "Marketplace"],
              ["/faq", "FAQ"],
              ["/get-the-app", "App release details"],
            ].map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      {children}
      <footer className="site-footer">
        <div className="wrap">
          <div className="footer-top">
            <Brand />
            <nav className="footer-links" aria-label="Footer navigation">
              <Link href="/games">The games</Link>
              <Link href="/how-to-play">Ranks and community</Link>
              <Link href="/contribute">Share a photo</Link>
              <Link href="/about">About</Link>
              <Link href="/marketplace">Marketplace</Link>
              <Link href="/faq">FAQ</Link>
              {/* Only the server's staff check shows the way in; the Admin guards itself regardless. */}
              {account?.isStaff && <AdminWorkspaceLink>Editor workspace</AdminWorkspaceLink>}
            </nav>
          </div>
          <div className="footer-bottom">
            <span>Airplane Games. Your Boarding Pass to Aviation Fun.</span>
            <nav className="actions legal-links" aria-label="Legal">
              {legalPages.map((p) => (
                <Link key={p.path} href={p.path}>
                  {p.label}
                </Link>
              ))}
              <CookieSettingsButton />
              <span>Private prototype</span>
            </nav>
          </div>
        </div>
      </footer>
    </>
  );
}
