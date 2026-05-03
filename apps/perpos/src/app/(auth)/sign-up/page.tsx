import { redirect } from "next/navigation";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const raw = sp.returnTo;
  const v = Array.isArray(raw) ? raw[0] : raw;
  redirect(v ? `/signin?returnTo=${encodeURIComponent(String(v))}` : "/signin");
}
