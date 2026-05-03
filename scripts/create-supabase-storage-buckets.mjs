import { createRequire } from "module";

const require = createRequire(new URL("../apps/perpos/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

function env(name) {
  return process.env[name] ?? "";
}

function required(name) {
  const v = env(name).trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parseBool(v, fallback) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "true" || s === "1" || s === "yes";
}

function parsePublicMap(input) {
  const out = new Map();
  const raw = String(input ?? "").trim();
  if (!raw) return out;
  for (const pair of raw.split(",")) {
    const p = pair.trim();
    if (!p) continue;
    const [k, v] = p.split(":").map((x) => String(x ?? "").trim());
    if (!k) continue;
    out.set(k, parseBool(v, false));
  }
  return out;
}

async function main() {
  const url = required("SUPABASE_URL");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const buckets = (env("BUCKETS") || "documents,poa_slips,poa_documents,worker_profile_pics,order-slips,order-refunds,company-representatives")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultPublic = parseBool(env("BUCKET_PUBLIC"), false);
  const publicMap = parsePublicMap(
    env("BUCKET_PUBLIC_MAP") ||
      "documents:false,poa_slips:false,poa_documents:false,worker_profile_pics:true,order-slips:true,order-refunds:true,company-representatives:true",
  );

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const bucket of buckets) {
    const isPublic = publicMap.has(bucket) ? publicMap.get(bucket) : defaultPublic;
    const { error } = await supabase.storage.createBucket(bucket, { public: !!isPublic });
    if (!error) {
      console.log(`Created bucket: ${bucket} (public=${!!isPublic})`);
      continue;
    }
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("already exists")) {
      console.log(`Bucket exists: ${bucket}`);
      continue;
    }
    throw error;
  }

  console.log("Done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
