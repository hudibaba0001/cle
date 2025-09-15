export interface BookingFormLike {
  zip_allowlist?: string[] | null;
}

const normalizeZip = (s: string) => (s || "").replace(/\s+/g, "");

export function validateZip(zip: string, form?: BookingFormLike) {
  const z = normalizeZip(zip);
  if (!z) return false; // empty not allowed
  const list = form?.zip_allowlist?.map(normalizeZip) ?? [];
  if (list.length === 0) return true; // permissive until forms are wired
  return list.includes(z);
}


