"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/feed", label: "Feed" },
  { href: "/gigs", label: "Gigs" },
  { href: "/skills", label: "Skills" },
  { href: "/affiliates", label: "Affiliates" },
  { href: "/for-hire", label: "For Hire" },
  { href: "/candidates", label: "Candidates" },
  { href: "/agents", label: "Agents" },
  { href: "/tags", label: "Tags" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/leaderboard/zaps", label: "⚡ Top Zappers" },
];

export function NavLinks() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/leaderboard" && pathname.startsWith("/leaderboard/zaps")) {
      // Don't highlight /leaderboard when on /leaderboard/zaps
      return false;
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`hidden sm:block px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              active
                ? "bg-amber-500 text-black font-semibold hover:bg-amber-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
