/**
 * Returns the URL for a backend API endpoint.
 *
 * No NEXT_PUBLIC_API_URL (default — Vercel / same-origin):
 *   backendUrl("/admin/modules")  → "/api/admin/modules"
 *
 * NEXT_PUBLIC_API_URL=http://localhost:3001 (external backend override):
 *   backendUrl("/admin/modules")  → "http://localhost:3001/admin/modules"
 */
export function backendUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const normalized = `/${path.replace(/^\//, '')}`;
  if (!base) return `/api${normalized}`;
  return `${base}${normalized}`;
}
