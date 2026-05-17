/**
 * Returns the absolute URL for a Nest.js backend endpoint.
 * Set NEXT_PUBLIC_API_URL in .env.local (e.g. http://localhost:3001 for dev).
 * Strips any leading /api prefix — Nest.js routes don't use that prefix.
 */
export function backendUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');
  const normalized = path.replace(/^\/api\//, '/').replace(/^\/?/, '/');
  return `${base}${normalized}`;
}
