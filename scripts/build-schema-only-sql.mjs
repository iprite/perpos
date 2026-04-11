import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const OUT_FILE = path.join(ROOT, "supabase", "schema-only.sql");

function shouldExclude(fileName) {
  const n = fileName.toLowerCase();
  if (!n.endsWith(".sql")) return true;
  if (n.includes("seed")) return true;
  if (n.includes("verify")) return true;
  if (n.includes("part_")) return true;
  if (n.includes("manual")) return true;
  // exclude data-migration helper scripts (not schema)
  if (n.includes("import_modified_csv")) return true;
  return false;
}

function groupKey(fileName) {
  const n = fileName.toLowerCase();
  if (n === "exapp_schema.sql") return 0;
  if (n.startsWith("exapp_")) return 1;
  if (/^20\d{12}_/.test(n) || /^20\d{12}/.test(n)) return 2;
  return 3;
}

function sortFiles(a, b) {
  const ga = groupKey(a);
  const gb = groupKey(b);
  if (ga !== gb) return ga - gb;
  const sa = a.toLowerCase();
  const sb = b.toLowerCase();
  const priority = (name) => {
    if (name === "exapp_schema.sql") return -100;
    if (name === "quotation_module.sql") return -90;
    if (name === "quotation_module_vat_wht.sql") return -89;
    if (name === "exapp_prd_modules.sql") return -80;
    if (name === "exapp_order_payments.sql") return -70;
    if (name === "exapp_order_refunds.sql") return -69;
    if (name === "exapp_order_operations_management.sql") return -60;
    if (name === "exapp_supabase_storage_documents.sql") return -50;
    if (name === "exapp_company_representatives.sql") return -40;
    if (name === "exapp_pat_table.sql") return -30;
    if (name === "exapp_pat_provinces_view.sql") return -29;
    if (name === "20260402194000_pat_provinces_allow_internal_read.sql") return -28;
    return 0;
  };
  const pa = priority(sa);
  const pb = priority(sb);
  if (pa !== pb) return pa - pb;
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
}

function readSql(filePath) {
  return fs.readFileSync(filePath, "utf8").trim();
}

function splitStatements(sql) {
  const out = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let dollarTag = null;

  const startsWithDollarTag = (s, i) => {
    if (s[i] !== "$") return null;
    const rest = s.slice(i);
    const m = rest.match(/^\$[A-Za-z0-9_]*\$/);
    return m ? m[0] : null;
  };

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inDouble && !dollarTag && ch === "'" && !inSingle) {
      inSingle = true;
      buf += ch;
      continue;
    }
    if (!inDouble && !dollarTag && ch === "'" && inSingle) {
      if (next === "'") {
        buf += "''";
        i++;
        continue;
      }
      inSingle = false;
      buf += ch;
      continue;
    }

    if (!inSingle && !dollarTag && ch === '"' && !inDouble) {
      inDouble = true;
      buf += ch;
      continue;
    }
    if (!inSingle && !dollarTag && ch === '"' && inDouble) {
      inDouble = false;
      buf += ch;
      continue;
    }

    if (!inSingle && !inDouble) {
      const tag = startsWithDollarTag(sql, i);
      if (tag) {
        if (!dollarTag) {
          dollarTag = tag;
          buf += tag;
          i += tag.length - 1;
          continue;
        }
        if (dollarTag === tag) {
          dollarTag = null;
          buf += tag;
          i += tag.length - 1;
          continue;
        }
      }
    }

    if (!inSingle && !inDouble && !dollarTag && ch === ";") {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      continue;
    }

    buf += ch;
  }

  const last = buf.trim();
  if (last) out.push(last);
  return out;
}

function filterSchemaOnlyStatements(sql) {
  const statements = splitStatements(sql);
  const keep = [];
  for (const s of statements) {
    const t = s.trimStart().toLowerCase();
    const isCteDml =
      t.startsWith("with ") &&
      (t.includes("\ninsert ") ||
        t.includes("\nupdate ") ||
        t.includes("\ndelete ") ||
        t.includes("\ntruncate ") ||
        t.includes("\ncopy ") ||
        t.includes("\nselect "));
    if (
      isCteDml ||
      t.startsWith("insert ") ||
      t.startsWith("update ") ||
      t.startsWith("delete ") ||
      t.startsWith("truncate ") ||
      t.startsWith("copy ")
    ) {
      continue;
    }
    keep.push(s);
  }
  return keep.join(";\n\n") + ";\n";
}

function main() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error("Missing supabase/migrations");
    process.exit(1);
  }

  const all = fs.readdirSync(MIGRATIONS_DIR).filter((f) => !shouldExclude(f));
  const files = all.sort(sortFiles);

  const blocks = [];
  for (const f of files) {
    const full = path.join(MIGRATIONS_DIR, f);
    const sql = filterSchemaOnlyStatements(readSql(full));
    if (!sql) continue;
    blocks.push(sql);
  }

  const out = `${blocks.join("\n\n")}\n\nNOTIFY pgrst, 'reload config';\n`;
  fs.writeFileSync(OUT_FILE, out, "utf8");
  console.log(`Wrote: ${OUT_FILE}`);
  console.log(`Included ${files.length} migration files (schema-only, excluding seed/import/verify/manual).`);
}

main();
