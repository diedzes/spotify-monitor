"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/playlists", label: "Playlists" },
  { href: "/groups", label: "Groups" },
  { href: "/reports", label: "Reports" },
  { href: "/scheduler", label: "Scheduler" },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <nav className="flex flex-wrap items-center gap-1 sm:gap-2" aria-label="Main navigation">
          {navItems.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "rounded-lg bg-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
                    : "rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <a
          href="/api/auth/spotify/logout"
          className="shrink-0 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          Sign out
        </a>
      </div>
    </header>
  );
}
