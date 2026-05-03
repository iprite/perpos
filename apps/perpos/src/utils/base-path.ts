export const APP_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/perpos").trim();

function normalizeBasePath(basePath: string) {
  if (!basePath) return "";
  if (basePath === "/") return "";
  const withLeadingSlash = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

export function withBasePath(path: string) {
  const basePath = normalizeBasePath(APP_BASE_PATH);
  if (!basePath) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const withLeadingSlash = path.startsWith("/") ? path : `/${path}`;
  return `${basePath}${withLeadingSlash}`;
}
