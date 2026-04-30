export default function Head() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const origin = url ? new URL(url).origin : null;

  return (
    <>
      {origin ? <link rel="preconnect" href={origin} crossOrigin="" /> : null}
    </>
  );
}

