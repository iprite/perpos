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

function createAdmin(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ensureBucket(supabase, bucket, isPublic) {
  const { error } = await supabase.storage.createBucket(bucket, { public: isPublic });
  if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
    throw error;
  }
}

async function bucketExists(supabase, bucket) {
  const { error } = await supabase.storage.getBucket(bucket);
  if (!error) return true;
  const msg = String(error.message || "").toLowerCase();
  if (msg.includes("not found") || msg.includes("does not exist")) return false;
  throw error;
}

async function listAllObjects(supabase, bucket) {
  const out = [];
  async function walk(prefix) {
    let offset = 0;
    const limit = 1000;
    // pagination is needed for large buckets
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit, offset });
      if (error) throw error;
      const items = data ?? [];
      if (items.length === 0) break;
      for (const it of items) {
        const name = String(it.name ?? "");
        if (!name) continue;
        const fullPath = prefix ? `${prefix}/${name}` : name;
        const isFolder = !it.id && !it.metadata;
        if (isFolder) {
          await walk(fullPath);
        } else {
          out.push(fullPath);
        }
      }
      if (items.length < limit) break;
      offset += items.length;
    }
  }
  await walk("");
  return out;
}

async function copyObject({ from, to, bucket, path }) {
  const dl = await from.storage.from(bucket).download(path);
  if (dl.error) throw dl.error;
  const blob = dl.data;
  const bytes = Buffer.from(await blob.arrayBuffer());

  const up = await to.storage.from(bucket).upload(path, bytes, { upsert: true });
  if (up.error) throw up.error;
}

async function main() {
  const oldUrl = required("OLD_SUPABASE_URL");
  const oldService = required("OLD_SUPABASE_SERVICE_ROLE_KEY");
  const newUrl = required("NEW_SUPABASE_URL");
  const newService = required("NEW_SUPABASE_SERVICE_ROLE_KEY");
  const buckets = (env("BUCKETS") || "documents,order-slips,order-refunds")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isPublic = (env("BUCKET_PUBLIC") || "false").trim().toLowerCase() === "true";

  const from = createAdmin(oldUrl, oldService);
  const to = createAdmin(newUrl, newService);

  for (const bucket of buckets) {
    console.log(`\nBucket: ${bucket}`);
    const exists = await bucketExists(from, bucket);
    if (!exists) {
      console.log("Skip (missing in old project)");
      continue;
    }
    await ensureBucket(to, bucket, isPublic);
    const objects = await listAllObjects(from, bucket);
    console.log(`Found ${objects.length} objects`);
    let done = 0;
    for (const path of objects) {
      await copyObject({ from, to, bucket, path });
      done += 1;
      if (done % 25 === 0 || done === objects.length) {
        console.log(`Copied ${done}/${objects.length}`);
      }
    }
  }

  console.log("\nDone");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
