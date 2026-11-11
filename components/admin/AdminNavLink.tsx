"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
  A nav item that knows whether it is the page you are on.

  `exact` exists for Overview alone: /admin is a prefix of every other
  route here, so a plain startsWith would light it up permanently and
  the sidebar would never tell you where you are.
*/
export function AdminNavLink({
  href, label, exact = false, children,
}: {
  href: string;
  label: string;
  exact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition ${
        active
          ? "bg-brand-600 text-white shadow-sm"
          : "text-white/65 hover:text-white hover:bg-white/5"
      }`}
    >
      <span className={active ? "text-white" : "text-white/45"}>{children}</span>
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );
}
