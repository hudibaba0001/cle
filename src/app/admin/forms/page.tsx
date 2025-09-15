import Link from "next/link";
export const dynamic = "force-dynamic";
export default function BookingForms() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Booking Forms</h1>
        <Link href="/admin/forms/builder" className="rounded-xl bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">Create Form</Link>
      </div>
      <p className="text-sm text-neutral-600">Create and publish embeddable booking forms with ZIP rules and service allow-list.</p>
      <div className="rounded-xl border p-4 text-sm text-neutral-600">Forms list placeholder. Use “Form Builder” to create a form.</div>
    </div>
  );
}


