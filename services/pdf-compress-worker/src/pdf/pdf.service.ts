import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { getAdminClient } from '../lib/supabase';

// error ที่ "ผู้ใช้แก้เองได้" (ไฟล์เสีย/ใหญ่เกิน/หน้าเกิน) → แสดงข้อความนี้ตรง ๆ ได้
// ส่วน error เทคนิค (python ล้ม, fs) แปลงเป็นข้อความ generic ฝั่งเรียก
export class UserFacingError extends Error {}

/** bucket เก็บไฟล์ PDF (ต้นฉบับ + ผลลัพธ์) — ตรงกับ migration P1a */
export const PDF_BUCKET = 'assistant_pdf';

// engine = python (pikepdf + Pillow) — surgical: บีบเฉพาะรูปถ่ายใหญ่ คง transparency/โลโก้
//   ต่างจาก ghostscript ที่ flatten transparency → กล่องดำใน Apple Preview (ดู docs §บทเรียน)
const PYTHON_BIN = (process.env.PYTHON_BIN ?? 'python3').trim();
// compress.py ถูก copy ไปไว้ข้าง main.js (dist/) ตอน build — pdf.service.js อยู่ dist/pdf/
const SCRIPT_PATH = join(__dirname, '..', 'compress.py');

export interface CompressResult {
  /** ไฟล์ผลลัพธ์ (ถ้า noGain = ไฟล์ต้นฉบับเดิม) */
  bytes: Buffer;
  pages: number;
  sizeBefore: number;
  sizeAfter: number;
  /** บีบแล้วไม่เล็กลง → ส่งไฟล์เดิมคืน (ฝั่งเรียกจะ refund quota) */
  noGain: boolean;
  /** สัดส่วนที่ลดได้ 0..1 (0 ถ้า noGain) */
  ratio: number;
}

interface PyStats {
  pages: number;
  size_before: number;
  size_after: number;
  no_gain: boolean;
  ratio: number;
  error?: string;
}

/** เรียก compress.py: in.pdf → out.pdf · คืน stats (parse JSON จาก stdout) */
function runPython(inPath: string, outPath: string): Promise<PyStats> {
  return new Promise((resolve, reject) => {
    const py = spawn(PYTHON_BIN, [SCRIPT_PATH, inPath, outPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d) => (stdout += String(d)));
    py.stderr.on('data', (d) => (stderr += String(d)));
    py.on('error', (e) => reject(new Error(`python spawn failed: ${e.message}`)));
    py.on('close', (code) => {
      let parsed: PyStats | null = null;
      try {
        parsed = JSON.parse(stdout.trim()) as PyStats;
      } catch {
        /* ignore — handle below */
      }
      // exit 2 = user-facing error (มี {"error"} ใน stdout)
      if (code === 2 && parsed?.error) {
        reject(new UserFacingError(parsed.error));
        return;
      }
      if (code !== 0 || !parsed || parsed.error) {
        reject(new Error(`compress.py exited ${code}: ${(stderr || stdout).slice(0, 500)}`));
        return;
      }
      resolve(parsed);
    });
  });
}

/**
 * บีบ PDF แบบ surgical (pure function: รับ bytes คืน bytes) — เขียน temp → spawn python → อ่านผล
 * cleanup temp เสมอ (finally)
 */
export async function compressPdf(input: Buffer): Promise<CompressResult> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfc-'));
  const inPath = join(dir, `in-${randomBytes(4).toString('hex')}.pdf`);
  const outPath = join(dir, `out-${randomBytes(4).toString('hex')}.pdf`);
  try {
    await writeFile(inPath, input);
    const stats = await runPython(inPath, outPath);
    const bytes = await readFile(outPath);
    return {
      bytes,
      pages: stats.pages,
      sizeBefore: stats.size_before,
      sizeAfter: stats.size_after,
      noGain: stats.no_gain,
      ratio: stats.ratio,
    };
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new Error(e instanceof Error ? e.message : String(e));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface BucketCompressResult extends Omit<CompressResult, 'bytes'> {
  /** path ผลลัพธ์ใน bucket (ถ้า noGain = path ต้นฉบับเดิม ไม่ได้อัปไฟล์ใหม่) */
  outputPath: string;
}

/** derive output path: <dir>/<name>.pdf → <dir>/<name>-compressed.pdf */
function toOutputPath(inputPath: string): string {
  return inputPath.replace(/\.pdf$/i, '') + '-compressed.pdf';
}

/**
 * บีบไฟล์ PDF ที่อยู่ใน bucket assistant_pdf — download → compressPdf → upload ผลลัพธ์
 *   ใช้ flow จริง (P1c) เพื่อเลี่ยงลิมิต request body 32MB ของ Cloud Run
 *   noGain → ไม่อัปไฟล์ใหม่ ชี้ outputPath กลับไฟล์เดิม (ฝั่งเรียก refund quota)
 */
export async function compressBucketObject(inputPath: string): Promise<BucketCompressResult> {
  const admin = getAdminClient();

  const { data, error } = await admin.storage.from(PDF_BUCKET).download(inputPath);
  if (error || !data) {
    throw new Error(`download from ${PDF_BUCKET}/${inputPath} failed: ${error?.message ?? 'no data'}`);
  }
  const input = Buffer.from(await data.arrayBuffer());

  const result = await compressPdf(input);
  if (result.noGain) {
    return { outputPath: inputPath, pages: result.pages, sizeBefore: result.sizeBefore, sizeAfter: result.sizeAfter, noGain: true, ratio: 0 };
  }

  const outputPath = toOutputPath(inputPath);
  const { error: upErr } = await admin.storage
    .from(PDF_BUCKET)
    .upload(outputPath, result.bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`upload to ${PDF_BUCKET}/${outputPath} failed: ${upErr.message}`);

  return { outputPath, pages: result.pages, sizeBefore: result.sizeBefore, sizeAfter: result.sizeAfter, noGain: false, ratio: result.ratio };
}
