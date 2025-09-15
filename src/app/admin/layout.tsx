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
