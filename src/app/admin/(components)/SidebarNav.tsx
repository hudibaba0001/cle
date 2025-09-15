"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { label: string; href: string };

const sections: { title: string; items: Item[] }[] = [
  { title: "MANAGEMENT", items: [
      { label: "Dashboard", href: "/admin" },
      { label: "Company Settings", href: "/admin/company" },
      { label: "Service Manager", href: "/admin/services" },
      { label: "Booking Forms", href: "/admin/forms" },
      { label: "Bookings", href: "/admin/bookings" },
  ]},
];

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-2xl border shadow-sm bg-white p-3">
      <div className="space-y-4">
        {sections.map((sec) => (
          <div key={sec.title}>
            <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-neutral-500">{sec.title}</div>
            <ul className="space-y-1">
              {sec.items.map((it) => {
                const active = pathname === it.href || (it.href !== "/admin" && pathname.startsWith(it.href));
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={[
                        "block rounded-xl px-3 py-2 text-sm border",
                        active ? "bg-neutral-50 border-neutral-300" : "border-transparent hover:bg-neutral-50",
                      ].join(" ")}
                      aria-current={active ? "page" : undefined}
                    >
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-semibold tracking-wide text-neutral-500">QUICK LINKS</div>
          <ul className="mt-2 space-y-1">
            <li>
              <Link href="/admin/services/v2" className="block rounded-xl px-3 py-2 text-sm border border-transparent hover:bg-neutral-50">
                Services v2 (Builder)
              </Link>
            </li>
            <li>
              <Link href="/admin/forms/builder" className="block rounded-xl px-3 py-2 text-sm border border-transparent hover:bg-neutral-50">
                Form Builder
              </Link>
            </li>
          </ul>
        </div>

        <div className="mt-4 border-t pt-3">
          <div className="text-xs font-semibold tracking-wide text-neutral-500">QUICK STATS</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border p-2">
              <div className="text-neutral-500">Active Services</div>
              <div className="font-medium">0</div>
            </div>
            <div className="rounded-xl border p-2">
              <div className="text-neutral-500">This Month</div>
              <div className="font-medium">0 bookings</div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}


