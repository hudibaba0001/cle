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
