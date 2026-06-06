import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../../../_lib/module-auth';
import { createAdminClient } from '../../../../_lib/supabase';
import { ok, Err } from '../../../../_lib/response';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { jobId, firmOrgId, entryDate, referenceNumber, memo, lines, postToLedger } = body ?? {};

  if (!jobId) return Err.missingField('jobId');
  if (!firmOrgId) return Err.missingField('firmOrgId');
  if (!entryDate) return Err.missingField('entryDate');
  if (!lines || !Array.isArray(lines) || lines.length < 2) {
    return NextResponse.json({
      ok: false,
      error: { code: 'ERR_INVALID_PAYLOAD', message: 'ต้องมีรายการบัญชีอย่างน้อย 2 รายการ' }
    }, { status: 400 });
  }

  // 1. ตรวจสอบสิทธิ์ผู้ใช้งาน (ต้องมีสิทธิ์ในโมดูล acc_firm และไม่ใช่ระดับ viewer)
  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  if (auth.moduleRole === 'viewer') {
    return Err.forbidden('ไม่มีสิทธิ์อนุมัติหรือบันทึกข้อมูลสมุดรายวัน');
  }

  const admin = createAdminClient();

  // 2. ดึงข้อมูล OCR Job
  const { data: job, error: jobError } = await admin
    .from('ocr_processing_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('firm_org_id', firmOrgId)
    .maybeSingle();

  if (jobError) return Err.dbError(jobError);
  if (!job) return Err.notFound(`OCR Job ID ${jobId}`);

  // 2.1 ตรวจสอบว่าความสัมพันธ์ลูกค้ายังคงเป็น active อยู่หรือไม่
  const { data: clientRelation, error: relationError } = await admin
    .from('acc_firm_clients')
    .select('id, status')
    .eq('firm_org_id', firmOrgId)
    .eq('client_org_id', job.client_org_id)
    .maybeSingle();

  if (relationError) return Err.dbError(relationError);
  if (!clientRelation || clientRelation.status !== 'active') {
    return Err.forbidden('สิทธิ์ความสัมพันธ์ของลูกค้าถูกปิดใช้งานหรือไม่ถูกต้อง');
  }

  // 2.2 ห้ามแก้ไข/ผ่านบัญชีซ้ำ หากสมุดรายวันถูกผ่านบัญชี (posted) หรือยกเลิก (void) แล้ว
  if (job.draft_journal_id) {
    const { data: existingJe, error: existingErr } = await admin
      .from('journal_entries')
      .select('status')
      .eq('id', job.draft_journal_id)
      .eq('organization_id', job.client_org_id)
      .maybeSingle();

    if (existingErr) return Err.dbError(existingErr);
    if (existingJe && (existingJe.status === 'posted' || existingJe.status === 'void')) {
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
      return NextResponse.json({
        ok: false,
        error: { code: 'ERR_INVALID_PAYLOAD', message: 'แต่ละบรรทัดต้องมีเดบิตหรือเครดิตเพียงฝั่งเดียวเท่านั้น' }
      }, { status: 400 });
    }
    if (debit === 0 && credit === 0) {
      return NextResponse.json({
        ok: false,
        error: { code: 'ERR_INVALID_PAYLOAD', message: 'พบรายการมียอดเงินเป็นศูนย์' }
      }, { status: 400 });
    }
    totalDebit += debit;
    totalCredit += credit;
  }

  const diff = Math.abs(totalDebit - totalCredit);
  if (diff > 0.01) {
    return NextResponse.json({
      ok: false,
      error: { code: 'ERR_UNBALANCED_JOURNAL', message: `ยอดเดบิตและเครดิตไม่สมดุล (เดบิต: ${totalDebit.toFixed(2)}, เครดิต: ${totalCredit.toFixed(2)})` }
    }, { status: 400 });
  }

  // 3.1 ตรวจสอบว่าทุก accountId / contactId เป็นของลูกค้ารายนี้จริง (กันการอ้างอิงข้ามองค์กร)
  const accountIds = Array.from(new Set(lines.map((l: any) => l.accountId).filter(Boolean)));
  if (accountIds.length === 0) {
    return Err.missingField('accountId');
  }

  const { data: validAccounts, error: accErr } = await admin
    .from('accounts')
    .select('id')
    .eq('organization_id', job.client_org_id)
    .in('id', accountIds);

  if (accErr) return Err.dbError(accErr);
  const validAccountSet = new Set((validAccounts || []).map((a: any) => a.id));
  const badAccount = accountIds.find((id) => !validAccountSet.has(id));
  if (badAccount) {
    return Err.invalidFormat('accountId', 'มีรหัสบัญชีที่ไม่อยู่ในผังบัญชีของลูกค้ารายนี้');
  }

  const contactIds = Array.from(
    new Set(lines.map((l: any) => l.contactId).filter(Boolean)),
  );
  if (contactIds.length > 0) {
    const { data: validContacts, error: conErr } = await admin
      .from('contacts')
      .select('id')
      .eq('organization_id', job.client_org_id)
      .in('id', contactIds);

    if (conErr) return Err.dbError(conErr);
    const validContactSet = new Set((validContacts || []).map((c: any) => c.id));
    const badContact = contactIds.find((id) => !validContactSet.has(id));
    if (badContact) {
      return Err.invalidFormat('contactId', 'มีผู้ติดต่อที่ไม่อยู่ในระบบของลูกค้ารายนี้');
    }
  }

  // 4. บันทึก/อัปเดต Journal Entry
  let journalId = job.draft_journal_id;
  let isNewEntry = false;
  let backupItems: any[] | null = null;
  
  if (journalId) {
    // 4.1 อัปเดตข้อมูลหัวเรื่อง (journal_entries)
    const updateData: any = {
      entry_date: entryDate,
      reference_number: referenceNumber || null,
      memo: memo || null,
      updated_at: new Date().toISOString()
    };

    if (postToLedger) {
      updateData.status = 'posted';
      updateData.posted_at = new Date().toISOString();
    }

    const { error: updateJeError } = await admin
      .from('journal_entries')
      .update(updateData)
      .eq('id', journalId)
      .eq('organization_id', job.client_org_id);

    if (updateJeError) return Err.dbError(updateJeError);

    // 4.2 สำรองข้อมูลบรรทัดรายการเดิมเผื่อการ rollback และเคลียร์บรรทัดเดิมใน journal_items
    const { data: oldItems } = await admin
      .from('journal_items')
      .select('*')
      .eq('journal_entry_id', journalId)
      .eq('organization_id', job.client_org_id);

    const { error: deleteJiError } = await admin
      .from('journal_items')
      .delete()
      .eq('journal_entry_id', journalId)
      .eq('organization_id', job.client_org_id);

    if (deleteJiError) return Err.dbError(deleteJiError);
    backupItems = oldItems;

  } else {
    // 4.3 กรณีที่ไม่มี draft_journal_id เดิม
    const { data: newJe, error: newJeError } = await admin
      .from('journal_entries')
      .insert({
        organization_id: job.client_org_id,
        entry_date: entryDate,
        reference_number: referenceNumber || null,
        memo: memo || null,
        status: postToLedger ? 'posted' : 'draft',
        posted_at: postToLedger ? new Date().toISOString() : null,
        created_by: auth.userId,
        created_by_ai: true,
        ocr_job_id: jobId
      })
      .select('id')
      .single();

    if (newJeError) return Err.dbError(newJeError);
    journalId = newJe.id;
    isNewEntry = true;
  }

  // 5. บันทึกบรรทัดรายการใหม่ (journal_items)
  const itemsToInsert = lines.map((line: any, idx: number) => ({
    organization_id: job.client_org_id,
    journal_entry_id: journalId,
    line_no: idx + 1,
    account_id: line.accountId,
    contact_id: line.contactId || null,
    description: line.description || null,
    debit: Math.max(0, Number(line.debit || 0)),
    credit: Math.max(0, Number(line.credit || 0))
  }));

  const { error: insertJiError } = await admin
    .from('journal_items')
    .insert(itemsToInsert);

  if (insertJiError) {
    // Rollback ในกรณีเขียนรายการบรรทัดไม่สำเร็จ
    if (isNewEntry && journalId) {
      await admin
        .from('journal_entries')
        .delete()
        .eq('id', journalId)
        .eq('organization_id', job.client_org_id);
    } else if (backupItems && backupItems.length > 0 && journalId) {
      const itemsToRestore = backupItems.map((item: any) => ({
        organization_id: item.organization_id,
        journal_entry_id: item.journal_entry_id,
        line_no: item.line_no,
        account_id: item.account_id,
        contact_id: item.contact_id || null,
        description: item.description || null,
        debit: item.debit,
        credit: item.credit
      }));
      await admin.from('journal_items').insert(itemsToRestore);
    }
    return Err.dbError(insertJiError);
  }

  // 6. อัปเดตข้อมูลลิงก์ของ OCR Job
  const updateJobData: any = {
    draft_journal_id: journalId,
    updated_at: new Date().toISOString()
  };

  // ถ้านำเข้า Ledger สำเร็จ ให้บันทึกว่างานสำเร็จสมบูรณ์
  if (postToLedger) {
    updateJobData.status = 'completed';
  }

  const { error: updateJobErr } = await admin
    .from('ocr_processing_jobs')
    .update(updateJobData)
    .eq('id', jobId);

  if (updateJobErr) return Err.dbError(updateJobErr);

  return ok({
    message: postToLedger ? 'ผ่านรายการสมุดรายวันเสร็จสมบูรณ์' : 'บันทึกสมุดรายวันร่างเรียบร้อย',
    journalEntryId: journalId
  });
}
