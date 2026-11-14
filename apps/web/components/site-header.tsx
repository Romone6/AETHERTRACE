"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AethertraceMark from "@/components/aethertrace-mark";

const links = [
  ["/explorer", "Explorer"],
  ["/evidence", "Evidence"],
  ["/archive", "Archive"],
  ["/method", "Method"],
] as const;

export default function SiteHeader() {
  const pathname = usePathname();
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Aethertrace home">
          <AethertraceMark /><span>AETHERTRACE</span>
        </Link>
        <nav aria-label="Main navigation">
          {links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}
        </nav>
        <Link className="header-cta" href="/explorer">Open deck <span aria-hidden="true">↗</span></Link>
      </header>
    </>
  );
}
