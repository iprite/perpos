/**
 * API Route Handler: /api/acc-firm/ocr/jobs/process
 *
 * POST /api/acc-firm/ocr/jobs/process
 *   — สั่งเริ่มประมวลผลงาน OCR ดึงข้อมูลดิบจากบิล (Phase 2)
 *   body: { jobId, firmOrgId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleMember } from '../../../../_lib/module-auth';
import { createAdminClient } from '../../../../_lib/supabase';
import { ok, Err } from '../../../../_lib/response';
import { 
  downloadAndEncodeDocument, 
  extractOcrWithGemini, 
  getClientContext, 
  classifyTransaction, 
  generateJournalEntry 
} from '../../../../../../lib/ai/gemini';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { jobId, firmOrgId } = body ?? {};

  if (!jobId) return Err.missingField('jobId');
  if (!firmOrgId) return Err.missingField('firmOrgId');

  // ตรวจสอบสิทธิ์ผู้ใช้งานเป็นสำนักงานบัญชี
  const auth = await requireModuleMember(req, firmOrgId, 'acc_firm');
  if (!auth.ok) return auth.res;

  if (auth.moduleRole === 'viewer') {
    return Err.forbidden('ไม่มีสิทธิ์สั่งดำเนินการประมวลผล OCR');
  }

  const admin = createAdminClient();

  // ดึงรายละเอียดข้อมูลงาน OCR
  const { data: job, error: jobError } = await admin
    .from('ocr_processing_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('firm_org_id', firmOrgId)
    .maybeSingle();

  if (jobError) return Err.dbError(jobError);
  if (!job) return Err.notFound(`OCR Job ID ${jobId}`);

  // ตรวจสอบเพื่อไม่ประมวลผลซ้ำหากอยู่ในสถานะสำเร็จแล้ว
  if (job.status === 'completed') {
    return ok({ message: 'งานประมวลผลเสร็จสมบูรณ์แล้ว', job });
  }

  // อัปเดตสถานะงานเป็น 'processing'
  const { error: updateStartError } = await admin
    .from('ocr_processing_jobs')
    .update({ 
      status: 'processing',
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);

  if (updateStartError) return Err.dbError(updateStartError);

  try {
    // 1. ดาวน์โหลดเอกสารและเข้ารหัสเป็น Base64
    const { base64, mimeType } = await downloadAndEncodeDocument(job.document_url);

    // 2. เรียกใช้งาน Gemini 2.5 Flash เพื่อประมวลผลโครงสร้าง JSON (OCR Step)
    const extractedData = await extractOcrWithGemini(base64, mimeType);

    // 3. ดึง Client Context และ Chart of Accounts
    const clientContext = await getClientContext(firmOrgId, job.client_org_id);

    // 4. ประมวลผลหาคู่บัญชีแนะนำ (Classification Step)
    const classification = await classifyTransaction(extractedData, clientContext);

    // 5. บันทึกคำนวณเดบิต-เครดิต (Journal Entry Generation Step)
    const journalData = await generateJournalEntry(extractedData, classification, clientContext);

    // 6. แปลงรหัสบัญชี (Account Code) ในผลลัพธ์เป็น Account UUID และบันทึกบัญชีร่าง (Draft Journal)
    let draftJournalId: string | null = null;
    
    if (journalData.entries && journalData.entries.length >= 2) {
      // 6.1 บันทึกหัวข้อสมุดบัญชีรายวันร่าง (journal_entries)
      const { data: je, error: jeError } = await admin
        .from('journal_entries')
        .insert({
          organization_id: job.client_org_id,
          entry_date: journalData.posting_date || new Date().toISOString().split('T')[0],
          reference_number: journalData.document_ref || null,
          memo: journalData.description || 'บันทึกบัญชีอัตโนมัติจากใบเสร็จ/บิล',
          status: 'draft',
          created_by: auth.userId,
          created_by_ai: true,
          ocr_job_id: jobId
        })
        .select('id')
        .single();

      if (jeError) throw jeError;
      draftJournalId = je.id;

      // 6.2 แมปรหัสบัญชีและสร้างรายการบรรทัดเดบิต/เครดิต (journal_items)
      try {
        const itemsToInsert = journalData.entries.map((entry: any) => {
          const acc = clientContext.chart_of_accounts.find((a: any) => a.code === entry.account_code);
          if (!acc) {
            throw new Error(`ไม่พบรหัสบัญชี "${entry.account_code}" ในผังบัญชีของลูกค้า`);
          }

          let debit = Math.max(0, Number(entry.debit || 0));
          let credit = Math.max(0, Number(entry.credit || 0));

          if (debit > 0 && credit > 0) {
            throw new Error(`บรรทัดรายการรหัสบัญชี "${entry.account_code}" ต้องมียอดเดบิตหรือเครดิตเพียงอย่างใดอย่างหนึ่งเท่านั้น`);
          }
          if (debit === 0 && credit === 0) {
            throw new Error(`บรรทัดรายการรหัสบัญชี "${entry.account_code}" มียอดเงินเป็นศูนย์ทั้งสองฝั่ง`);
          }

          return {
            organization_id: job.client_org_id,
            journal_entry_id: draftJournalId,
            line_no: entry.line,
            account_id: acc.id,
            description: entry.memo || null,
            debit,
            credit
          };
        });

        const { error: jiError } = await admin
          .from('journal_items')
          .insert(itemsToInsert);

        if (jiError) throw jiError;
      } catch (insertError) {
        if (draftJournalId) {
          // ลบหัวข้อเอกสารที่ค้างไว้ทิ้งเพื่อความสมบูรณ์ทางธุรกรรม
          await admin
            .from('journal_entries')
            .delete()
            .eq('id', draftJournalId);
        }
        throw insertError;
      }
    }

    // 7. อัปเดตข้อมูลจ๊อบทั้งหมดลงตาราง ocr_processing_jobs
    const { data: updatedJob, error: updateEndError } = await admin
      .from('ocr_processing_jobs')
      .update({
        status: 'completed',
        extracted_json: extractedData as any,
        classified_json: {
          classification,
          journal: journalData
        } as any,
        draft_journal_id: draftJournalId,
        error_message: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select('*')
      .single();

    if (updateEndError) return Err.dbError(updateEndError);

    return ok(updatedJob);

  } catch (err: any) {
    const errorMsg = err.message || 'เกิดข้อผิดพลาดในการประมวลผลเอกสาร';
    console.error(`[OCR Process Error] Job ${jobId}:`, err);

    // บันทึกข้อผิดพลาดกรณีการประมวลผลล้มเหลว
    const { data: failedJob } = await admin
      .from('ocr_processing_jobs')
      .update({
        status: 'failed',
        error_message: errorMsg,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select('*')
      .single();

    return NextResponse.json({
      ok: false,
      error: {
        code: 'ERR_EXTERNAL_SERVICE',
        message: errorMsg,
        details: { jobId }
      }
    }, { status: 502 });
  }
}
