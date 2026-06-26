import { NextRequest, NextResponse } from "next/server";
import { requireModuleMember } from "../../../../_lib/module-auth";
import { createAdminClient } from "../../../../_lib/supabase";
import { ok, Err } from "../../../../_lib/response";

// Generate entry_number (D1): OCR-YYYYMMDD-<6-char rand> — unique ต่อ org
function generateEntryNumber(entryDate: string): string {
  const datePart = entryDate.replace(/-/g, "").slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `OCR-${datePart}-${rand}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // D3: ไม่รับ contactId ต่อบรรทัดอีกต่อไป (acc_journal_lines ไม่มี contact_id)
  const { jobId, firmOrgId, entryDate, referenceNumber, memo, lines, postToLedger } = body ?? {};

  if (!jobId) return Err.missingField("jobId");
  if (!firmOrgId) return Err.missingField("firmOrgId");
  if (!entryDate) return Err.missingField("entryDate");
  if (!lines || !Array.isArray(lines) || lines.length < 2) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "ERR_INVALID_PAYLOAD", message: "ต้องมีรายการบัญชีอย่างน้อย 2 รายการ" },
      },
      { status: 400 },
    );
  }

  // 1. ตรวจสอบสิทธิ์ผู้ใช้งาน (ต้องมีสิทธิ์ในโมดูล acc_firm และไม่ใช่ระดับ viewer)
  const auth = await requireModuleMember(req, firmOrgId, "acc_firm");
  if (!auth.ok) return auth.res;

  if (auth.moduleRole === "viewer") {
    return Err.forbidden("ไม่มีสิทธิ์อนุมัติหรือบันทึกข้อมูลสมุดรายวัน");
  }

  const admin = createAdminClient();

  // 2. ดึงข้อมูล OCR Job
  const { data: job, error: jobError } = await admin
    .from("ocr_processing_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("firm_org_id", firmOrgId)
    .maybeSingle();

  if (jobError) return Err.dbError(jobError);
  if (!job) return Err.notFound(`OCR Job ID ${jobId}`);

  // 2.1 ตรวจสอบว่าความสัมพันธ์ลูกค้ายังคงเป็น active อยู่หรือไม่
  const { data: clientRelation, error: relationError } = await admin
    .from("acc_firm_clients")
    .select("id, status")
    .eq("firm_org_id", firmOrgId)
    .eq("client_org_id", job.client_org_id)
    .maybeSingle();

  if (relationError) return Err.dbError(relationError);
  if (!clientRelation || clientRelation.status !== "active") {
    return Err.forbidden("สิทธิ์ความสัมพันธ์ของลูกค้าถูกปิดใช้งานหรือไม่ถูกต้อง");
  }

  // 2.2 D6: ห้ามแก้ไข/ผ่านบัญชีซ้ำ หากสมุดรายวัน (acc_journal_entries) ถูกผ่านบัญชีหรือยกเลิกแล้ว
  if (job.draft_journal_id) {
    const { data: existingJe, error: existingErr } = await admin
      .from("acc_journal_entries")
      .select("status")
      .eq("id", job.draft_journal_id)
      .eq("org_id", job.client_org_id)
      .maybeSingle();

    if (existingErr) return Err.dbError(existingErr);
    if (existingJe && (existingJe.status === "posted" || existingJe.status === "void")) {
      return Err.entryLocked(job.draft_journal_id);
    }
  }

  // 3. ตรวจสอบความถูกต้องของบัญชีคู่ (Debit = Credit)
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const debit = Math.max(0, Number(line.debit || 0));
    const credit = Math.max(0, Number(line.credit || 0));
    if (debit > 0 && credit > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "ERR_INVALID_PAYLOAD",
            message: "แต่ละบรรทัดต้องมีเดบิตหรือเครดิตอย่างใดอย่างหนึ่ง ไม่ใช่ทั้งสอง",
          },
        },
        { status: 400 },
      );
    }
    totalDebit += debit;
    totalCredit += credit;
  }

  // ยอดเดบิตและเครดิตต้องสมดุล
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "ERR_INVALID_PAYLOAD", message: "ยอดเดบิตและเครดิตไม่สมดุล" },
      },
      { status: 400 },
    );
  }

  // 3.1 ตรวจสอบ account IDs ว่าอยู่ใน acc_accounts ของ client org (ไม่ใช่ accounts เดิม)
  const accountIds = Array.from(
    new Set(lines.map((l: { accountId?: string }) => l.accountId).filter(Boolean)),
  );
  if (accountIds.length === 0) {
    return Err.missingField("accountId");
  }

  const { data: validAccounts, error: accErr } = await admin
    .from("acc_accounts")
    .select("id, code")
    .eq("org_id", job.client_org_id)
    .in("id", accountIds);

  if (accErr) return Err.dbError(accErr);
  const validAccountMap = new Map(
    (validAccounts || []).map((a: { id: string; code: string }) => [a.id, a.code]),
  );
  const badAccount = accountIds.find((id) => !validAccountMap.has(id as string));
  if (badAccount) {
    return Err.invalidFormat("accountId", "มีรหัสบัญชีที่ไม่อยู่ในผังบัญชีของลูกค้ารายนี้");
  }

  // D3: ไม่มี contact validation ต่อบรรทัด — acc_journal_lines ไม่มี contact_id

  // D5: period check — ห้ามลงบัญชีงวดที่ปิดแล้ว
  const entryDateObj = new Date(entryDate);
  const periodYear = entryDateObj.getFullYear();
  const periodMonth = entryDateObj.getMonth() + 1;
  const { data: period, error: periodErr } = await admin
    .from("acc_periods")
    .select("id, status")
    .eq("org_id", job.client_org_id)
    .eq("year", periodYear)
    .eq("month", periodMonth)
    .maybeSingle();
  if (periodErr) return Err.dbError(periodErr);
  if (period && period.status === "closed") {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "ERR_PERIOD_CLOSED",
          message: `งวดบัญชี ${periodYear}/${String(periodMonth).padStart(2, "0")} ปิดแล้ว ลงบัญชีไม่ได้`,
        },
      },
      { status: 400 },
    );
  }
  const periodId = period ? period.id : null;

  // D2: รวม referenceNumber เข้า description
  const description = referenceNumber ? `[${referenceNumber}] ${memo || ""}` : memo || null;

  // 4. บันทึก/อัปเดต acc_journal_entries
  let journalId = job.draft_journal_id as string | null;
  let isNewEntry = false;
  let backupLines: Record<string, unknown>[] | null = null;

  if (journalId) {
    // 4.1 อัปเดตข้อมูลหัวเรื่อง (acc_journal_entries)
    const updateData: Record<string, unknown> = {
      entry_date: entryDate,
      description,
      period_id: periodId,
      total_debit: totalDebit,
      total_credit: totalCredit,
    };

    if (postToLedger) {
      updateData.status = "posted";
    }

    const { error: updateJeError } = await admin
      .from("acc_journal_entries")
      .update(updateData)
      .eq("id", journalId)
      .eq("org_id", job.client_org_id);

    if (updateJeError) return Err.dbError(updateJeError);

    // 4.2 สำรองบรรทัดเดิมเผื่อ rollback และเคลียร์บรรทัดเดิมใน acc_journal_lines
    const { data: oldLines } = await admin
      .from("acc_journal_lines")
      .select("org_id, journal_entry_id, account_id, sort_order, line_note, debit, credit")
      .eq("journal_entry_id", journalId)
      .eq("org_id", job.client_org_id);

    const { error: deleteJiError } = await admin
      .from("acc_journal_lines")
      .delete()
      .eq("journal_entry_id", journalId)
      .eq("org_id", job.client_org_id);

    if (deleteJiError) return Err.dbError(deleteJiError);
    backupLines = oldLines ?? null;
  } else {
    // 4.3 กรณีที่ไม่มี draft_journal_id เดิม — สร้าง entry ใหม่
    const { data: newJe, error: newJeError } = await admin
      .from("acc_journal_entries")
      .insert({
        org_id: job.client_org_id,
        entry_number: generateEntryNumber(entryDate),
        entry_date: entryDate,
        description,
        status: postToLedger ? "posted" : "draft",
        period_id: periodId,
        source: "ai",
        source_ref_id: jobId,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: auth.userId,
      })
      .select("id")
      .single();

    if (newJeError) return Err.dbError(newJeError);
    journalId = newJe.id as string;
    isNewEntry = true;
  }

  // 5. บันทึกบรรทัดรายการใหม่ (acc_journal_lines — ไม่มี contact_id, ใช้ sort_order/line_note)
  const itemsToInsert = lines.map(
    (
      line: { accountId: string; debit?: number; credit?: number; description?: string },
      idx: number,
    ) => ({
      org_id: job.client_org_id,
      journal_entry_id: journalId,
      account_id: line.accountId,
      sort_order: idx + 1,
      line_note: line.description || null,
      debit: Math.max(0, Number(line.debit || 0)),
      credit: Math.max(0, Number(line.credit || 0)),
    }),
  );

  const { error: insertJiError } = await admin.from("acc_journal_lines").insert(itemsToInsert);

  if (insertJiError) {
    // Rollback ในกรณีเขียนรายการบรรทัดไม่สำเร็จ
    if (isNewEntry && journalId) {
      await admin
        .from("acc_journal_entries")
        .delete()
        .eq("id", journalId)
        .eq("org_id", job.client_org_id);
    } else if (backupLines && backupLines.length > 0 && journalId) {
      await admin.from("acc_journal_lines").insert(backupLines);
    }
    return Err.dbError(insertJiError);
  }

  // 6. อัปเดตข้อมูลลิงก์ของ OCR Job (draft_journal_id ชี้ acc_journal_entries.id)
  const updateJobData: Record<string, unknown> = {
    draft_journal_id: journalId,
    updated_at: new Date().toISOString(),
  };

  if (postToLedger) {
    updateJobData.status = "completed";
  }

  const { error: updateJobErr } = await admin
    .from("ocr_processing_jobs")
    .update(updateJobData)
    .eq("id", jobId);

  if (updateJobErr) return Err.dbError(updateJobErr);

  // ─── 7. Learning Loop Feedback & Vendor Mapping Updates ───
  try {
    const ext = job.extracted_json as { vendor?: { name?: string; tax_id?: string } } | null;
    const vendorName = ext?.vendor?.name ? String(ext.vendor.name).trim() : "";
    const vendorTaxId = ext?.vendor?.tax_id ? String(ext.vendor.tax_id).trim() : null;

    let primaryDebitAccountId: string | null = null;
    const debitLines = lines.filter((l: { debit?: number }) => Number(l.debit || 0) > 0);
    if (debitLines.length > 0) {
      const sorted = [...debitLines].sort(
        (a: { debit?: number }, b: { debit?: number }) =>
          Number(b.debit || 0) - Number(a.debit || 0),
      );
      primaryDebitAccountId = (sorted[0] as { accountId: string }).accountId;
    }

    if (vendorName && primaryDebitAccountId) {
      let existingMap: { id: string; use_count: number } | null = null;
      if (vendorTaxId) {
        const { data } = await admin
          .from("ocr_vendor_mappings")
          .select("id, use_count")
          .eq("org_id", job.client_org_id)
          .eq("vendor_tax_id", vendorTaxId)
          .maybeSingle();
        existingMap = data;
      }
      if (!existingMap) {
        const { data } = await admin
          .from("ocr_vendor_mappings")
          .select("id, use_count")
          .eq("org_id", job.client_org_id)
          .eq("vendor_name", vendorName)
          .maybeSingle();
        existingMap = data;
      }

      if (existingMap) {
        await admin
          .from("ocr_vendor_mappings")
          .update({
            vendor_tax_id: vendorTaxId || null,
            debit_account_id: primaryDebitAccountId,
            use_count: (existingMap.use_count || 1) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", existingMap.id);
      } else {
        await admin.from("ocr_vendor_mappings").insert({
          org_id: job.client_org_id,
          vendor_name: vendorName,
          vendor_tax_id: vendorTaxId || null,
          debit_account_id: primaryDebitAccountId,
          use_count: 1,
          last_used_at: new Date().toISOString(),
        });
      }
    }

    // Save feedback log
    const aiJournal = (
      job.classified_json as { journal?: unknown; classification?: unknown } | null
    )?.journal;
    const originalClassified =
      (job.classified_json as { classification?: unknown } | null)?.classification ?? {};
    const originalJournal = aiJournal ?? {};

    const approvedClassified = {
      transaction_type:
        (originalClassified as { transaction_type?: string }).transaction_type || "purchase",
      business_event: (originalClassified as { business_event?: string }).business_event || "",
      primary_debit_account_id: primaryDebitAccountId,
      tax_treatment: (originalClassified as { tax_treatment?: unknown }).tax_treatment || {},
    };

    const approvedJournal = {
      posting_date: entryDate,
      document_ref: referenceNumber || null,
      description: memo || null,
      entries: lines.map(
        (
          l: { accountId: string; debit?: number; credit?: number; description?: string },
          idx: number,
        ) => ({
          line: idx + 1,
          account_code: validAccountMap.get(l.accountId) || "",
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
          description: l.description || null,
        }),
      ),
    };

    let isEdited = false;
    const aiEntries =
      (
        aiJournal as {
          entries?: Array<{ account_code?: string; debit?: number; credit?: number }>;
        } | null
      )?.entries || [];
    if (aiEntries.length !== lines.length) {
      isEdited = true;
    } else {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] as { accountId: string; debit?: number; credit?: number };
        const aiLine = aiEntries[i];
        const lineCode = validAccountMap.get(line.accountId) || "";

        if (
          lineCode !== aiLine?.account_code ||
          Number(line.debit || 0) !== Number(aiLine?.debit || 0) ||
          Number(line.credit || 0) !== Number(aiLine?.credit || 0)
        ) {
          isEdited = true;
          break;
        }
      }
    }

    await admin.from("ocr_feedback_logs").insert({
      job_id: jobId,
      org_id: job.client_org_id,
      original_classified: originalClassified,
      approved_classified: approvedClassified,
      original_journal: originalJournal,
      approved_journal: approvedJournal,
      is_edited: isEdited,
    });
  } catch (feedbackErr) {
    console.error("[ocr-api] Failed to save learning loop feedback:", feedbackErr);
    // Feedback loop failures should not block successful approval response
  }

  return ok({
    message: postToLedger ? "ผ่านรายการสมุดรายวันเสร็จสมบูรณ์" : "บันทึกสมุดรายวันร่างเรียบร้อย",
    journalEntryId: journalId,
  });
}
