/**
 * provision.ts — เตรียมข้อมูลตั้งต้นของคลังเอกสารให้สำนักงานบัญชี 1 แห่ง
 *
 * ทำไมต้องมี: migration seed แม่แบบให้เฉพาะ org ที่เปิด `acc_firm` **อยู่แล้ว ณ วันที่ apply**
 * (= jtacc รายเดียว) — org ที่ super_admin เปิดทีหลังจะไม่มีแม่แบบ แล้ว "เปิดงวด" จะล้มด้วย
 * ข้อความ "ยังไม่มีแม่แบบรายการเอกสาร" ⇒ แขวนตัวนี้ไว้กับจังหวะที่ module ถูกเปิด
 *
 * idempotent: firm ที่มีแม่แบบ default แล้วจะถูกข้าม (ไม่สร้างซ้ำ ไม่ทับของที่แก้เอง)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** due_rule ของแม่แบบเริ่มต้น — ต้องตรงกับ migration `20260729160200_acc_firm_vault_seed.sql` */
const DUE_RULE_BY_CODE: Record<string, string> = {
  "TAX-01": "PERIOD_END+7d",
  "TAX-02": "PERIOD_END+7d",
  "TAX-03": "PERIOD_END+7d",
  "TAX-05": "PERIOD_END+15d",
  "TAX-07": "PERIOD_END+15d",
  "TAX-08": "PERIOD_END+60d",
  "TAX-09": "PERIOD_END+150d",
  "BOK-05": "PERIOD_END+150d",
  "BOK-06": "PERIOD_END+150d",
};

export async function seedAccFirmVault(
  orgId: string,
  admin: SupabaseClient,
): Promise<{ templates: number; items: number }> {
  const { data: existing } = await admin
    .from("acc_firm_vault_templates")
    .select("id")
    .eq("firm_org_id", orgId)
    .eq("is_default", true)
    .maybeSingle();
  if (existing) return { templates: 0, items: 0 };

  const { data: categories, error: catErr } = await admin
    .from("acc_firm_vault_categories")
    .select("id, code, frequency, required_by_default, group_code")
    .eq("is_active", true)
    .neq("group_code", "ADM"); // งานสำนักงานไม่อยู่ใน checklist ที่ทวงลูกค้า
  if (catErr) throw new Error(catErr.message);
  if (!categories || categories.length === 0) {
    throw new Error("ยังไม่มี taxonomy เอกสาร — migration seed ยังไม่ถูก apply");
  }

  const { data: template, error: tplErr } = await admin
    .from("acc_firm_vault_templates")
    .insert({
      firm_org_id: orgId,
      name: "บริษัทจำกัด (จด VAT)",
      entity_type: "company",
      vat_registered: true,
      is_default: true,
    })
    .select("id")
    .single();
  if (tplErr) throw new Error(tplErr.message);

  const rows = categories.map((c) => ({
    template_id: template.id as string,
    category_id: c.id as string,
    is_required: Boolean(c.required_by_default),
    due_rule:
      DUE_RULE_BY_CODE[c.code as string] ?? (c.frequency === "monthly" ? "PERIOD_END+7d" : null),
  }));

  const { error: itemErr } = await admin.from("acc_firm_vault_template_items").insert(rows);
  if (itemErr) throw new Error(itemErr.message);

  return { templates: 1, items: rows.length };
}
