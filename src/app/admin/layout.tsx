import { Suspense, type ReactNode } from "react";
import SidebarNav from "./(components)/SidebarNav";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="mx-auto max-w-7xl">
        <header className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-blue-600" aria-hidden />
            <div className="font-semibold">CleanBooker</div>
            <span className="ml-2 text-sm text-neutral-500">Service Management</span>
          </div>
          <div className="text-sm text-neutral-500">Admin</div>
        </header>
      </div>

      <div className="mx-auto max-w-7xl grid grid-cols-12 gap-4 px-4 pb-8">
        <aside className="col-span-12 md:col-span-3 lg:col-span-3">
          <Suspense fallback={<div className="rounded-2xl border p-4">Loading menu…</div>}>
            <SidebarNav />
          </Suspense>
        </aside>

        <main className="col-span-12 md:col-span-9 lg:col-span-9">
          <div className="rounded-2xl border shadow-sm p-4 bg-white">{children}</div>
        </main>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-gray-900">Admin Dashboard</h1>
              <div className="hidden md:flex space-x-6">
                <Link href="/admin/services" className="text-gray-600 hover:text-blue-600 font-medium">Services</Link>
                <Link href="/admin/services/v2" className="text-gray-600 hover:text-blue-600 font-medium">Services v2</Link>
                <Link href="/admin/bookings" className="text-gray-600 hover:text-blue-600 font-medium">Bookings</Link>
                <a href="/admin/analytics" className="text-gray-400 cursor-not-allowed">Analytics</a>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">Demo Tenant</span>
              <Link href="/debug/quote" className="text-blue-600 hover:text-blue-800 text-sm">Test Pricing</Link>
            </div>
          </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
