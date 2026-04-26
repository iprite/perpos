import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import chromium from "@sparticuz/chromium";
import { chromium as pwChromium } from "playwright-core";

export const runtime = "nodejs";

function safeErrorMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.length > 600 ? `${msg.slice(0, 600)}…` : msg;
}

async function resolveChromiumExecutablePath() {
  const fromEnv =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    process.env.CHROMIUM_PATH ||
    process.env.CHROME_BIN ||
    process.env.GOOGLE_CHROME_BIN;
  if (fromEnv) return fromEnv;

  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome-beta",
    "/usr/bin/google-chrome-unstable",
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      continue;
    }
  }
  return undefined;
}

async function loadStampDataUrl(request: Request) {
  const transparent1x1 =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNgYGD4DwABBAEAHqGZ2QAAAABJRU5ErkJggg==";
  try {
    const url = new URL("/stamp.png", request.url);
    const res = await fetch(url);
    if (!res.ok) return transparent1x1;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const base64 = Buffer.from(bytes).toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch {
    return transparent1x1;
  }
}

type PoaPdfRequest = {
  req: {
    id: string;
    display_id: string | null;
    import_temp_id: string | null;
    created_at?: string | null;
    payment_date?: string | null;
    poa_request_type_name?: string | null;
    worker_count?: number | null;
    worker_male?: number | null;
    worker_female?: number | null;
    worker_nation?: string | null;
    worker_type?: string | null;
    employer_name: string | null;
    employer_tax_id: string | null;
    employer_address: string | null;
    employer_type?: string | null;
    representative_prefix?: string | null;
    representative_first_name?: string | null;
    representative_last_name?: string | null;
    representative_id_card_no?: string | null;
    representative_address?: string | null;
    representative_name?: string | null;
  };
};

function formatThaiLongDate(d: Date) {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function joinName(parts: Array<string | null | undefined>) {
  return parts
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0)
    .join(" ");
}

function parseDateOrNow(v: string | null | undefined) {
  if (!v) return new Date();
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

function addDays(d: Date, days: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PoaPdfRequest;
    const req = body.req;

  const docId = req.display_id ?? req.import_temp_id ?? req.id;
  const issueBaseDate = req.payment_date ? parseDateOrNow(req.payment_date) : parseDateOrNow(req.created_at);
  const issueDate = formatThaiLongDate(issueBaseDate);
  const expireDate = formatThaiLongDate(addDays(issueBaseDate, 15));

  const employerName = escapeHtml(req.employer_name ?? "-");
  const employerTaxId = escapeHtml(req.employer_tax_id ?? "-");
  const employerAddress = escapeHtml(req.employer_address ?? "-");
  const workerCount = req.worker_count == null ? null : Math.max(0, Math.trunc(Number(req.worker_count)));
  const workerMale = req.worker_male == null ? null : Math.max(0, Math.trunc(Number(req.worker_male)));
  const workerFemale = req.worker_female == null ? null : Math.max(0, Math.trunc(Number(req.worker_female)));
  const workerNation = escapeHtml(String(req.worker_nation ?? "-") || "-");
  const workerType = escapeHtml(String(req.worker_type ?? "-") || "-");
  const employerType = escapeHtml(String(req.employer_type ?? "-") || "-");
  const workerTotal = workerCount ?? (workerMale == null && workerFemale == null ? null : (workerMale ?? 0) + (workerFemale ?? 0));

  const isMou = String(req.poa_request_type_name ?? "")
    .trim()
    .toUpperCase()
    .includes("MOU");

  const representativeFullNameRaw =
    joinName([req.representative_prefix, req.representative_first_name, req.representative_last_name]) ||
    String(req.representative_name ?? "").trim();
  const representativeFullName = escapeHtml(representativeFullNameRaw || "ตัวแทน");
  const representativeIdCard = escapeHtml(String(req.representative_id_card_no ?? "-") || "-");
  const representativeAddress = escapeHtml(String(req.representative_address ?? "-") || "-");

  const companyDirectorName = "นายพิเชษฐ เชื้อทอง";
  const companyLegalName = "บริษัท นําคนต่างด้าวมาทํางานในประเทศ เอ็กซ์เวิร์คเกอร์ จํากัด";
  const companyTaxId = "0115559001880";
  const companyAddress = "6/15 หมู่ 7 ถ.ศรีนครินทร์ ต.บางเมือง อ.เมือง จ.สมุทรปราการ 10270";
  const companyLicenseNo = "นจ. 0122/2561";
  const companyLicenseExpire = "18 มกราคม 2573";

    const stampDataUrl = await loadStampDataUrl(request);

  const generalSubtitle = "(ยื่นดำเนินการเอกสารที่เกี่ยวข้องกับแรงงานต่างด้าว)";
  const mouSets: Array<{ subtitle: string; item5: string }> = [
    {
      subtitle: "(ยื่นแบบคําร้องขอนําคนต่างด้าวเข้ามาทำงานในประเทศ)",
      item5: "สามารถดำเนินการเฉพาะการ ยื่นแบบคำร้องขอนำคนต่างด้าวเข้ามาทำงานในประเทศ เท่านั้น",
    },
    {
      subtitle: "(ยื่นคำขอรับใบอนุญาตทำงานแทนคนต่างด้าว)",
      item5: "สามารถดำเนินการเฉพาะการ ยื่นคำขอรับใบอนุญาตทำงานแทนคนต่างด้าว เท่านั้น",
    },
    {
      subtitle: "(ยื่นแบบแจ้งเข้าแรงงานต่างด้าวมาทำงานกับนายจ้างในประเทศ)",
      item5: "สามารถดำเนินการเฉพาะการ ยื่นแบบแจ้งเข้าแรงงานต่างด้าวมาทำงานกับนายจ้างในประเทศ เท่านั้น",
    },
  ];

  const page1Html = (subtitle: string) => `
    <div class="sheet">
      <div class="header">
        <div class="topbar"></div>
        <div class="inner">
          <div class="logo"><span class="ex">EX</span><span class="worker">WORKER</span></div>
          <div></div>
        </div>
      </div>

      <div class="content">
        <div class="power-of-attorney-container">
          <div class="header2">
            <span class="header-title">หนังสือมอบอำนาจ</span>
            <span class="header-subtitle">${escapeHtml(subtitle)}</span>
          </div>

          <div class="info-section">
            ทำที่ <span class="highlight">บนจ. เอ็กซ์เวิร์คเกอร์</span><br />
            วันที่ออก <span class="highlight">${issueDate}</span><br />
            เอกสารเลขที่ <span class="highlight">${escapeHtml(docId)}</span>
          </div>

          <div class="content-body">
            <div class="indent">
              ข้าพเจ้า <span class="highlight">${employerName}</span> เลขประจำตัวประชาชน/เลขทะเบียนนิติบุคคล <span class="highlight">${employerTaxId}</span> ที่อยู่ <span class="highlight">${employerAddress}</span>
            </div>

            <div class="indent">
              ขอมอบอํานาจให้ <span class="highlight">${escapeHtml(companyDirectorName)} (${escapeHtml(companyLegalName)})</span> เลขทะเบียนนิติบุคคล ${escapeHtml(companyTaxId)} สำนักงานตั้งอยูที่ ${escapeHtml(companyAddress)} เป็นผู้มีอํานาจทําการแทนข้าพเจ้าเพื่อดําเนินการต่อไปนี้
            </div>

            <ol class="ol-list">
              <li>ยื่นคำขอ หรือคำร้อง และเอกสารและหลักฐานเพื่อดำเนินการตามพระราชกำหนดการบริหารจัดการการทำงานของคนต่างด้าว พ.ศ. 2560 แก้ไขฉบับที่ 2 พ.ศ. 2561 หรือการอื่นใดอันจำเป็นที่เกี่ยวข้องได้</li>
              <li>ลงนามในบันทึกข้อตกลง หรือหนังสือหรือเอกสารที่เกี่ยวข้องได้</li>
              <li>แก้ไขเพิ่มเติมข้อความในคำขอ หรือคำร้อง และเอกสารหลักฐานประกอบการดำเนินการตามพระราชกำหนดการบริหารจัดการการทำงานของคนต่างด้าว พ.ศ. 2560 แก้ไขฉบับที่ 2 พ.ศ. 2561</li>
              <li>ให้ถ้อยคำ หรือนำส่งคำขอหรือคำร้อง และเอกสารหลักฐานอื่นใดที่เกี่ยวข้องต่อพนักงานเจ้าหน้าที่</li>
              <li>มอบอำนาจช่วงให้บุคคลอื่นใด เพื่อดำเนินการตามหนังสือมอบอำนาจฉบับนี้อีกช่วงหนึ่ง</li>
              <li>ดำเนินการในเรื่องอื่นๆ ที่เกี่ยวข้องและดำเนินการตามขั้นตอนการนำแรงงานต่างด้าวเข้ามาทำงานในประเทศภายใต้ MOU จนเสร็จการ</li>
            </ol>

            <p class="indent">
              ทั้งนี้การกระทำใดๆ ที่ผู้รับมอบอำนาจได้กระทำไปตามที่ได้รับมอบหมายนั้น ข้าพเจ้าขอรับผิดชอบโดยสิ้นเชิงเสมือนหนึ่งว่าข้าพเจ้าได้กระทำการนั้นๆ ด้วยตัวข้าพเจ้าเอง
            </p>
          </div>

          <div class="signature-section">
            <div class="sig-block">
              ลงชื่อ .................................................. ผู้มอบอำนาจ<br />
              ( <span class="highlight">${employerName}</span> )
            </div>

            <div class="sig-block">
              ลงชื่อ
              <span class="sig-wrapper">
                ..................................................
                <img src="${stampDataUrl}" class="signature-img" alt="ตราประทับ" />
              </span>
              ผู้รับมอบอำนาจ<br />
              ( ${escapeHtml(companyDirectorName)} )<br />
              กรรมการบริษัท
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. พยาน<br />
              ( ........................................................... )
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. พยาน<br />
              ( ........................................................... )
            </div>
          </div>

          <div class="note-inline"></div>
        </div>

        <div class="note">
          <strong>หมายเหตุ:</strong> หากผู้มอบอำนาจประสงค์จะจำกัดขอบเขตการมอบอำนาจเป็นอย่างอื่นย่อมกระทำได้ โดยไม่ใช้หรือแก้ไข เพิ่มเติมข้อความข้างต้น
        </div>
      </div>

      <div class="footer">
        <div class="line"></div>
        <div class="text">
          บริษัท นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์ จำกัด | นจ. 0122/2561 | www.exworker.co.th<br />
          6/15 หมู่ที่ 7 ถนนศรีนครินทร์ ตำบลบางเมือง อำเภอเมือง จังหวัดสมุทรปราการ 10270 | โทร 098-648-6488
        </div>
      </div>
    </div>
  `;

  const page2GeneralHtml = () => `
    <div class="sheet">
      <div class="header">
        <div class="topbar"></div>
        <div class="inner">
          <div class="logo"><span class="ex">EX</span><span class="worker">WORKER</span></div>
          <div></div>
        </div>
      </div>

      <div class="content">
        <div class="power-of-attorney-container">
          <div class="header2">
            <span class="header-title">หนังสือมอบอำนาจ</span>
            <span class="header-subtitle">${escapeHtml(generalSubtitle)}</span>
          </div>

          <div class="info-section">
            ทำที่ <span class="highlight">บนจ. เอ็กซ์เวิร์คเกอร์</span><br />
            วันที่ออก <span class="highlight">${issueDate}</span><br />
            วันที่หมดอายุ <span class="highlight">${expireDate}</span><br />
            เอกสารเลขที่ <span class="highlight">${escapeHtml(docId)}</span>
          </div>

          <div class="content-body">
            <div class="indent">
              ข้าพเจ้า <span class="highlight">${escapeHtml(companyDirectorName)} (${escapeHtml(companyLegalName)})</span> เลขทะเบียนนิติบุคคล <span class="highlight">${escapeHtml(companyTaxId)}</span> ที่อยู่ <span class="highlight">${escapeHtml(companyAddress)}</span>
            </div>

            <div class="indent">
              ขอมอบอํานาจให้ <span class="highlight">${representativeFullName}</span> เลขประจำตัวประชาชน <span class="highlight">${representativeIdCard}</span> ที่อยู่ <span class="highlight">${representativeAddress}</span> เป็นผู้มีอํานาจทําการแทนข้าพเจ้าเพื่อดําเนินการต่อไปนี้
            </div>

            <ol class="ol-list">
              <li>ยื่นคำขอ หรือคำร้อง และเอกสารและหลักฐานเพื่อดำเนินการตามพระราชกำหนดการบริหารจัดการการทำงานของคนต่างด้าว พ.ศ. 2560 แก้ไขฉบับที่ 2 พ.ศ. 2561 หรือการอื่นใดอันจำเป็นที่เกี่ยวข้องได้</li>
              <li>ลงนามในบันทึกข้อตกลง หรือหนังสือหรือเอกสารที่เกี่ยวข้องได้</li>
              <li>แก้ไขเพิ่มเติมข้อความในคำขอ หรือคำร้อง และเอกสารหลักฐานประกอบการดำเนินการตามพระราชกำหนดการบริหารจัดการการทำงานของคนต่างด้าว พ.ศ. 2560 แก้ไขฉบับที่ 2 พ.ศ. 2561</li>
              <li>มอบอำนาจช่วงให้บุคคลอื่นได้ เพื่อดำเนินการตามหนังสือมอบอำนาจฉบับนี้อีกช่วงหนึ่ง</li>
              <li>สามารถดำเนินการเฉพาะการ ยื่นเอกสารที่เกี่ยวข้องกับแรงงานต่างด้าว กรณีที่ไม่ใช่การนำเข้า MOU เท่านั้น</li>
              <li>สามารถดำเนินการได้กับแรงงาน จำนวน ${escapeHtml(workerCount == null ? "-" : String(workerCount))} คน</li>
              <li class="strong">ไม่สามารถใช้ดำเนินการ นำเข้าแรงงานต่างด้าว MOU ทุกสัญชาติ ทุกกรณี</li>
              <li class="strong">ไม่สามารถใช้ดำเนินการ หลังวันที่หมดอายุเอกสาร</li>
            </ol>

            <p class="indent">
              ทั้งนี้การกระทำใดๆ ที่ผู้รับมอบอำนาจได้กระทำไปตามที่ได้รับมอบหมายนั้น ข้าพเจ้าขอรับผิดชอบโดยสิ้นเชิงเสมือนหนึ่งว่าข้าพเจ้าได้กระทำการนั้นๆ ด้วยตัวข้าพเจ้าเอง
            </p>
          </div>

          <div class="signature-section">
            <div class="sig-block">
              ลงชื่อ
              <span class="sig-wrapper">
                ..................................................
                <img src="${stampDataUrl}" class="signature-img" alt="ตราประทับ" />
              </span>
              ผู้มอบอำนาจ<br />
              ( <span class="highlight">${escapeHtml(companyDirectorName)}</span> )
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. ผู้รับมอบอำนาจ<br />
              ( <span class="highlight">${representativeFullName}</span> )
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. พยาน<br />
              ( ........................................................... )
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. พยาน<br />
              ( ........................................................... )
            </div>
          </div>

          <div class="note-inline"></div>
        </div>

        <div class="note">
          <strong>หมายเหตุ:</strong> หากผู้มอบอำนาจประสงค์จะจำกัดขอบเขตการมอบอำนาจเป็นอย่างอื่นย่อมกระทำได้ โดยไม่ใช้หรือแก้ไข เพิ่มเติมข้อความข้างต้น
        </div>
      </div>

      <div class="footer">
        <div class="line"></div>
        <div class="text">
          บริษัท นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์ จำกัด | นจ. 0122/2561 | www.exworker.co.th<br />
          6/15 หมู่ที่ 7 ถนนศรีนครินทร์ ตำบลบางเมือง อำเภอเมือง จังหวัดสมุทรปราการ 10270 | โทร 098-648-6488
        </div>
      </div>
    </div>
  `;

  const page2MouHtml = (subtitle: string, item5: string) => `
    <div class="sheet">
      <div class="header">
        <div class="topbar"></div>
        <div class="inner">
          <div class="logo"><span class="ex">EX</span><span class="worker">WORKER</span></div>
          <div></div>
        </div>
      </div>

      <div class="content">
        <div class="power-of-attorney-container">
          <div class="header2">
            <span class="header-title">หนังสือมอบอำนาจ</span>
            <span class="header-subtitle">${escapeHtml(subtitle)}</span>
          </div>

          <div class="info-section">
            ทำที่ <span class="highlight">บนจ. เอ็กซ์เวิร์คเกอร์</span><br />
            วันที่ออก <span class="highlight">${issueDate}</span><br />
            วันที่หมดอายุ <span class="highlight">${expireDate}</span><br />
            เอกสารเลขที่ <span class="highlight">${escapeHtml(docId)}</span>
          </div>

          <div class="content-body">
            <div class="indent">
              ข้าพเจ้า <span class="highlight">${escapeHtml(companyDirectorName)} (${escapeHtml(companyLegalName)})</span> เลขทะเบียนนิติบุคคล <span class="highlight">${escapeHtml(companyTaxId)}</span> ที่อยู่ <span class="highlight">${escapeHtml(companyAddress)}</span>
            </div>

            <div class="indent">
              ขอมอบอํานาจให้ <span class="highlight">${representativeFullName}</span> เลขประจำตัวประชาชน <span class="highlight">${representativeIdCard}</span> ที่อยู่ <span class="highlight">${representativeAddress}</span> เป็นผู้มีอํานาจทําการแทนข้าพเจ้าเพื่อดําเนินการต่อไปนี้
            </div>

            <ol class="ol-list">
              <li>ยื่นคำขอ หรือคำร้อง และเอกสารและหลักฐานเพื่อดำเนินการตามพระราชกำหนดการบริหารจัดการการทำงานของคนต่างด้าว พ.ศ. 2560 แก้ไขฉบับที่ 2 พ.ศ. 2561 หรือการอื่นใดอันจำเป็นที่เกี่ยวข้องได้</li>
              <li>ลงนามในบันทึกข้อตกลง หรือหนังสือหรือเอกสารที่เกี่ยวข้องได้</li>
              <li>แก้ไขเพิ่มเติมข้อความในคำขอ หรือคำร้อง และเอกสารหลักฐานประกอบการดำเนินการตามพระราชกำหนดการบริหารจัดการการทำงานของคนต่างด้าว พ.ศ. 2560 แก้ไขฉบับที่ 2 พ.ศ. 2561</li>
              <li>มอบอำนาจช่วงให้บุคคลอื่นได้ เพื่อดำเนินการตามหนังสือมอบอำนาจฉบับนี้อีกช่วงหนึ่ง</li>
              <li class="strong">${escapeHtml(item5)}</li>
              <li class="strong">สามารถดำเนินการได้กับแรงงาน จำนวน ${escapeHtml(workerCount == null ? "-" : String(workerCount))} คน</li>
            </ol>

            <p class="indent">
              ทั้งนี้การกระทำใดๆ ที่ผู้รับมอบอำนาจได้กระทำไปตามที่ได้รับมอบหมายนั้น ข้าพเจ้าขอรับผิดชอบโดยสิ้นเชิงเสมือนหนึ่งว่าข้าพเจ้าได้กระทำการนั้นๆ ด้วยตัวข้าพเจ้าเอง
            </p>
          </div>

          <div class="signature-section">
            <div class="sig-block">
              ลงชื่อ
              <span class="sig-wrapper">
                ..................................................
                <img src="${stampDataUrl}" class="signature-img" alt="ตราประทับ" />
              </span>
              ผู้มอบอำนาจ<br />
              ( <span class="highlight">${escapeHtml(companyDirectorName)}</span> )
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. ผู้รับมอบอำนาจ<br />
              ( <span class="highlight">${representativeFullName}</span> )
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. พยาน<br />
              ( ........................................................... )
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. พยาน<br />
              ( ........................................................... )
            </div>
          </div>

          <div class="note-inline"></div>
        </div>

        <div class="note">
          <strong>หมายเหตุ:</strong> หากผู้มอบอำนาจประสงค์จะจำกัดขอบเขตการมอบอำนาจเป็นอย่างอื่นย่อมกระทำได้ โดยไม่ใช้หรือแก้ไข เพิ่มเติมข้อความข้างต้น
        </div>
      </div>

      <div class="footer">
        <div class="line"></div>
        <div class="text">
          บริษัท นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์ จำกัด | นจ. 0122/2561 | www.exworker.co.th<br />
          6/15 หมู่ที่ 7 ถนนศรีนครินทร์ ตำบลบางเมือง อำเภอเมือง จังหวัดสมุทรปราการ 10270 | โทร 098-648-6488
        </div>
      </div>
    </div>
  `;

  const contractPage1Html = () => `
    <div class="sheet">
      <div class="header">
        <div class="topbar"></div>
        <div class="inner">
          <div class="logo"><span class="ex">EX</span><span class="worker">WORKER</span></div>
          <div></div>
        </div>
      </div>

      <div class="content">
        <div class="power-of-attorney-container">
          <div class="header2">
            <span class="header-title">สัญญาการให้บริการ การนำเข้าแรงงานต่างด้าว</span>
          </div>

          <div class="info-section">
            ทำที่ <span class="highlight">บนจ. เอ็กซ์เวิร์คเกอร์</span><br />
            วันที่ออก <span class="highlight">${issueDate}</span><br />
            เอกสารเลขที่ <span class="highlight">${escapeHtml(docId)}</span>
          </div>

          <div class="contract-body">
            <div class="contract-indent">
              สัญญาฉบับนี้ทำขึ้นระหว่าง <span class="highlight">${employerName}</span> เลขประจำตัวประชาชน/เลขทะเบียนนิติบุคคล <span class="highlight">${employerTaxId}</span> ที่อยู่ <span class="highlight">${employerAddress}</span> ซึ่งต่อไปนี้สัญญานี้เรียกว่า “ผู้ว่าจ้าง” กับ <span class="highlight">${escapeHtml(companyLegalName)}</span> เลขทะเบียนนิติบุคคล <span class="highlight">${escapeHtml(companyTaxId)}</span> สำนักงานตั้งอยู่ที่ <span class="highlight">${escapeHtml(companyAddress)}</span> เลขที่ใบอนุญาต <span class="highlight">${escapeHtml(companyLicenseNo)}</span> วันที่ใบอนุญาตนำคนต่างด้าวมาทำงานสิ้นอายุ <span class="highlight">${escapeHtml(companyLicenseExpire)}</span> ซึ่งต่อไปนี้สัญญานี้เรียกว่า “ผู้รับจ้าง”
            </div>

            <div class="contract-indent">
              โดยผู้ว่าจ้างมีความประสงค์ที่จะจ้างและมอบอำนาจให้ผู้รับจ้างดำเนินการนำคนต่างด้าวมาทำงานกับนายจ้างในประเทศตามรายละเอียดและเงื่อนไขดังต่อไปนี้
            </div>

            <div class="contract-heading">ข้อ 1 ผู้ว่าจ้างตกลงจ้างผู้รับจ้างดำเนินการนำคนต่างด้าว</div>
            <div class="contract-line">
              สัญชาติ <span class="highlight">${workerNation}</span> จำนวน <span class="highlight">${escapeHtml(workerTotal == null ? "-" : String(workerTotal))}</span> คน แบ่งเป็น เพศชายจำนวน <span class="highlight">${escapeHtml(workerMale == null ? "-" : String(workerMale))}</span> คน เพศหญิงจำนวน <span class="highlight">${escapeHtml(workerFemale == null ? "-" : String(workerFemale))}</span> คน เข้ามาทำงานในประเทศไทย ภายใต้บันทึกความตกลง หรือ บันทึกความเข้าใจที่รัฐบาลต่างประเทศ หรือ ตามนโยบายรัฐบาลว่าด้วย การจ้างแรงงาน มีระยะเวลาในการดำเนินการ 60-120 วัน (ระยะเวลาอาจจะลดลง หรือ ขยายได้ไม่เกิน 30 วันตามระยะการพิจารณาเอกสารของประเทศต้นทาง)
            </div>

            <div class="contract-heading">ข้อ 2 ผู้ว่าจ้างตกลงชำระค่าบริการและค่าใช้จ่ายในการรับจ้าง</div>
            <div class="contract-line">ผู้รับจ้างดำเนินการนำคนต่างด้าว เข้ามาทำงานในประเทศ โดยการชำระเงินค่าบริการและค่าใช้จ่าย ดังนี้</div>
            <div class="contract-line">2.1 ค่าใช้จ่ายในการนำคนต่างด้าวเข้ามาในประเทศ</div>
            <div class="contract-list">
              <div class="contract-line">(1) ค่าบริการ คนละ 1,000 บาท*</div>
              <div class="contract-line">(2) ค่าจัดทำและรับรองเอกสาร คนละ (ตามที่จ่ายจริง) บาท</div>
              <div class="contract-line">(3) ค่าพาหนะเดินทาง ค่าอาหาร ค่าที่พัก คนละ (ตามที่จ่ายจริง) บาท</div>
              <div class="contract-line">(4) ค่าใบอนุญาตทำงาน และค่าวีซ่า คนละ (ตามที่กฎหมายกำหนด) บาท</div>
            </div>
            <div class="contract-star">
              *ราคาดังกล่าวยังไม่รวมภาษีมูลค่าเพิ่ม / <span class="highlight">รายละเอียดค่าใช้จ่ายเป็นไปตามใบเสนอราคา</span>
            </div>

            <div class="contract-heading">ข้อ 3 รายละเอียดเกี่ยวกับสัญญาจ้างงานคนต่างด้าว</div>
            <div class="contract-item">
              3.1 ระยะเวลาการจ้างมีกำหนด 2 ปี เริ่มตั้งแต่วันที่คนงานต่างด้าวเดินทางมาถึงประเทศไทย โดยมีสถานที่ทำงานอยู่ที่ <span class="highlight">${employerAddress}</span> โดยทำงานประเภท <span class="highlight">${workerType}</span> ในกิจการ <span class="highlight">${employerType}</span> อัตราจ้าง ตามค่าแรงขั้นต่ำ
            </div>
            <div class="contract-item">
              3.2 ชั่วโมงการทำงาน ชั่วโมงทำงานปกติไม่เกิน 8 ชั่วโมง/วัน และใน 1 สัปดาห์ทำงาน 6 วัน
            </div>
            <div class="contract-item2">3.2.1 ผู้ว่าจ้างต้องจัดให้ลูกจ้างมีวันหยุดประจำสัปดาห์ สัปดาห์ละ 1 วัน</div>
            <div class="contract-item2">3.2.2 ผู้ว่าจ้างต้องจัดให้ลูกจ้างมีวันหยุดตามประเพณีไทย ปีละ 13 วัน</div>
            <div class="contract-item2">
              3.2.3 เมื่อลูกจ้างทำงานครบ 1 ปี ผู้ว่าจ้างตกลงจัดให้คนต่างด้าวหยุดพักผ่อนประจำปี โดยได้รับค่าจ้างเป็นไปตามกฎหมายคุ้มครองแรงงาน
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="line"></div>
        <div class="text">
          บริษัท นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์ จำกัด | นจ. 0122/2561 | www.exworker.co.th<br />
          6/15 หมู่ที่ 7 ถนนศรีนครินทร์ ตำบลบางเมือง อำเภอเมือง จังหวัดสมุทรปราการ 10270 | โทร 098-648-6488
        </div>
      </div>
    </div>
  `;

  const contractPage2Html = () => `
    <div class="sheet">
      <div class="header">
        <div class="topbar"></div>
        <div class="inner">
          <div class="logo"><span class="ex">EX</span><span class="worker">WORKER</span></div>
          <div></div>
        </div>
      </div>

      <div class="content">
        <div class="power-of-attorney-container">
          <div class="header2">
            <span class="header-title">สัญญาการให้บริการ การนำเข้าแรงงานต่างด้าว</span>
          </div>

          <div class="contract-body">
            <div class="contract-item">
              3.3 ค่าล่วงเวลาและค่าจ้างในวันหยุด นายจ้างให้ลูกจ้างทำงานเกินเวลาทำงานปกติ หรือวันหยุด ผู้ว่าจ้างต้องการจ่ายค่าล่วงเวลา ให้คนต่างด้าวในอัตราตามกฎหมายคุ้มครองแรงงาน
            </div>
            <div class="contract-item">
              3.4 ที่พักอาศัย ผู้ว่าจ้างตกลงจะจัดที่พักอาศัยที่ปลอดภัย และถูกสุขลักษณะให้กับคนต่างด้าว โดยค่าใช้จ่ายเรื่องที่พักให้ตกลงกันเองระหว่างผู้ว่าจ้างและคนต่างด้าว
            </div>
            <div class="contract-item">
              3.5 ค่ารักษาพยาบาล ผู้ว่าจ้างตกลงจะจัดให้มีการขึ้นทะเบียนประกันสังคมให้กับคนต่างด้าว
            </div>
            <div class="contract-item">3.6 การบอกเลิกสัญญา</div>
            <div class="contract-item2">
              3.6.1 กรณีผู้ว่าจ้าง ประสงค์บอกเลิกสัญญา ผู้ว่าจ้างจะต้องบอกกล่าวให้คนต่างด้าวทราบล่วงหน้า 1 เดือน หรือจ่ายเงินค่าจ้าง 1 เดือน แทนการบอกเลิกสัญญา หรือให้เป็นไปตามกฎหมายกำหนด รวมทั้งผู้ว่าจ้างต้องจ่ายค่าเดินทางกลับประเทศให้กับคนต่างด้าว
            </div>
            <div class="contract-item2">
              3.6.2 กรณีคนต่างด้าวประสงค์บอกเลิกสัญญา คนต่างด้าวต้องบอกกล่าวให้นายจ้างทราบล่วงหน้า 1 เดือน และต้องจ่ายค่าเดินทางกลับประเทศด้วยตนเอง
            </div>

            <div class="contract-heading">ข้อ 4 หน้าที่และความรับผิดชอบของผู้รับจ้างต่อผู้ว่าจ้าง</div>
            <div class="contract-item">
              4.1 ผู้รับจ้างนำคนต่างด้าวเข้ามาทำงานกับผู้ว่าจ้างแล้ว ผู้ว่าจ้างไม่พึงพอใจกับการทำงาน หรือ พฤติกรรมของคนต่างด้าว ให้ผู้ว่าจ้างแจ้งให้ผู้รับจ้างทราบ โดยผู้ว่าจ้างต้องแจ้ง เป็นลายลักษณ์อักษรให้กับผู้รับจ้างทราบ เพื่อให้นำคนต่างด้าวรายใหม่เข้ามาทำงาน ทดแทนจนเป็นที่พึงพอใจ
            </div>
            <div class="contract-item">
              4.2 หากผู้รับจ้างไม่สามารถหาคนต่างด้าวมาทดแทนจนเป็นที่พึงพอใจของผู้ว่าจ้าง ผู้รับจ้างจะคืนเงินค่าบริการในการนำคนต่างด้าวมาทำงานให้กับผู้ว่าจ้าง เฉพาะส่วนหรือ กลุ่มที่ขาดหายไป
            </div>
            <div class="contract-item">
              4.3 กรณีผู้รับจ้างไม่นำคนต่างด้าวมาทำงานตามสัญญาการนำคนต่างด้าวมาทำงานตาม ข้อ 1 ให้ผู้รับจ้างคืนค่าบริการ และค่าใช้จ่ายที่เรียกเก็บจากผู้ว่าจ้างไปแล้วทั้งหมด ให้คืนแก่ผู้ว่าจ้างภายในสามสิบวัน นับตั้งแต่วันที่ครบกำหนดสัญญานี้
            </div>

            <div class="contract-heading">ข้อ 5 การจัดส่งคนต่างด้าวกลับไปประเทศต้นทาง</div>
            <div class="contract-paragraph">
              เมื่อครบกำหนดตามสัญญาจ้าง ผู้รับจ้างจะจ่ายค่าโดยสารกลับภูมิลำเนาของคนต่างด้าวในกรณีทำงานครบสัญญา ยกเว้นกรณีที่เป็นความผิดของคนต่างด้าว หรือบอกเลิกสัญญา
            </div>

            <div class="contract-heading">ข้อ 6 การบอกเลิกสัญญาระหว่างผู้ว่าจ้างกับผู้รับจ้าง</div>
            <div class="contract-item">
              6.1 ผู้ว่าจ้างสามารถบอกเลิกจ้างได้ ถ้าผู้รับจ้างไม่ดำเนินการตามสัญญาฉบับนี้ โดยต้องบอกเลิกสัญญาก่อนที่ ผู้รับจ้างจะได้รับบัญชีรายชื่อ โดยผู้ว่าจ้างต้องแจ้งเป็นลายลักษณ์อักษรให้กับผู้รับจ้าง
            </div>
            <div class="contract-item">
              6.2 กรณีผู้ว่าจ้างบอกเลิกสัญญาผู้รับจ้าง หลังจากได้รับบัญชีรายชื่อแล้ว ผู้ว่าจ้างจะต้องจ่ายค่าชดเชย จำนวนเงิน 5,000 บาท (ห้าพันบาทถ้วน) ให้กับผู้รับจ้างภายใน 15 วัน
            </div>
            <div class="contract-item">
              6.3 กรณีคนต่างด้าวหนีหรือลาออกจากผู้ว่าจ้าง ผู้ว่าจ้างมีหน้าที่แจ้งให้ผู้รับจ้างทราบ เพื่อให้ผู้รับจ้างทำหน้าที่ตามกฎหมายกำหนด ภายใน 3 วัน หลังจากแรงงานออกจากผู้ว่าจ้าง
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="line"></div>
        <div class="text">
          บริษัท นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์ จำกัด | นจ. 0122/2561 | www.exworker.co.th<br />
          6/15 หมู่ที่ 7 ถนนศรีนครินทร์ ตำบลบางเมือง อำเภอเมือง จังหวัดสมุทรปราการ 10270 | โทร 098-648-6488
        </div>
      </div>
    </div>
  `;

  const contractPage3Html = () => `
    <div class="sheet">
      <div class="header">
        <div class="topbar"></div>
        <div class="inner">
          <div class="logo"><span class="ex">EX</span><span class="worker">WORKER</span></div>
          <div></div>
        </div>
      </div>

      <div class="content">
        <div class="power-of-attorney-container">
          <div class="header2">
            <span class="header-title">สัญญาการให้บริการ การนำเข้าแรงงานต่างด้าว</span>
          </div>

          <div class="contract-body">
            <div class="contract-indent">
              ผู้ว่าจ้างและผู้รับจ้างได้อ่านและเข้าใจ ข้อความในสัญญาฉบับนี้โดยตลอดแล้วเห็นว่าถูกต้องตรงตามเจตนารมณ์ทุกประการ จึงได้ลงลายมือชื่อและประทับตราสำคัญ (ถ้ามี) ไว้ต่อหน้าพยาน ณ วัน เดือน ปี ที่ระบุข้างต้น
            </div>
          </div>

          <div class="signature-section">
            <div class="sig-block">
              ลงชื่อ .................................................. ผู้ว่าจ้าง<br />
              ( <span class="highlight">${employerName}</span> )
            </div>

            <div class="sig-block">
              ลงชื่อ
              <span class="sig-wrapper">
                ..................................................
                <img src="${stampDataUrl}" class="signature-img" alt="ตราประทับ" />
              </span>
              ผู้รับจ้าง<br />
              ( ${escapeHtml(companyDirectorName)} )<br />
              กรรมการบริษัท
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. พยาน<br />
              ( ........................................................... )
            </div>

            <div class="sig-block">
              ลงชื่อ .................................................. พยาน<br />
              ( ........................................................... )
            </div>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="line"></div>
        <div class="text">
          บริษัท นำคนต่างด้าวมาทำงานในประเทศ เอ็กซ์เวิร์คเกอร์ จำกัด | นจ. 0122/2561 | www.exworker.co.th<br />
          6/15 หมู่ที่ 7 ถนนศรีนครินทร์ ตำบลบางเมือง อำเภอเมือง จังหวัดสมุทรปราการ 10270 | โทร 098-648-6488
        </div>
      </div>
    </div>
  `;

  const sheetsHtml = isMou
    ? `${mouSets.map((s) => `${page1Html(s.subtitle)}${page2MouHtml(s.subtitle, s.item5)}`).join("")}${contractPage1Html()}${contractPage2Html()}${contractPage3Html()}`
    : `${page1Html(generalSubtitle)}${page2GeneralHtml()}`;

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Exo+2:ital,wght@0,200;0,300;0,400;0,500;0,600;1,600&family=Prompt:wght@300;400;500&family=Sarabun:wght@300;400;500;600&display=swap" rel="stylesheet" />
    <style>
      @page { size: A4; margin: 0; }
      html, body { margin: 0; padding: 0; }
      body { font-family: 'Sarabun', sans-serif; font-weight: 300; color: #333; }

      .sheet {
        position: relative;
        width: 210mm;
        height: 297mm;
        margin: 0;
        background: #fff;
        break-after: page;
        page-break-after: always;
      }
      .sheet:last-of-type {
        break-after: auto;
        page-break-after: auto;
      }

      .header {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 95px;
        background: #fff;
      }
      .header .topbar {
        height: 8px;
        background: linear-gradient(90deg, #0b2441 0%, #2b6cb0 45%, #1e90ff 100%);
      }
      .header .inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 32px 0 32px;
      }
      .logo {
        font-family: 'Exo 2', sans-serif;
        font-size: 35px;
        line-height: 1;
        letter-spacing: 0px;
      }
      .logo .ex { font-style: italic; font-weight: 600; color: #0b2441; }
      .logo .worker { font-weight: 300; color: #666; }

      .footer {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 90px;
        background: #fff;
        padding: 0 32px;
      }
      .footer .line {
        height: 3px;
        background: linear-gradient(90deg, #1e90ff 0%, #2b6cb0 55%, #0b2441 100%);
        border-radius: 2px;
        margin-top: 10px;
      }
      .footer .text {
        margin-top: 10px;
        text-align: center;
        font-family: 'Prompt', sans-serif;
        font-weight: 300;
        font-size: 11px;
        line-height: 1.6;
        color: #333;
        letter-spacing: 0.7px;
      }

      .content {
        position: absolute;
        top: 95px;
        left: 0;
        right: 0;
        bottom: 90px;
        padding: 22px 40px 0 40px;
      }

      .note {
        position: absolute;
        left: 40px;
        right: 40px;
        bottom: 0;
        font-size: 10px;
        opacity: 0.85;
        line-height: 1.25;
      }

      .power-of-attorney-container {
        font-family: 'Sarabun', sans-serif;
        font-weight: 300;
        line-height: 1.6;
        color: #333;
        max-width: 800px;
        margin: 0 auto;
      }
      .header2 {
        text-align: center;
        margin-bottom: 12px;
      }
      .header-title {
        font-weight: 500;
        font-size: 18px;
        display: block;
        color: #000;
      }
      .header-subtitle {
        font-size: 14px;
        font-weight: 300;
        display: block;
      }
      .info-section {
        text-align: right;
        font-size: 14px;
        margin-bottom: 40px;
      }
      .content-body { font-size: 14px; }
      .indent { text-indent: 45px; margin-bottom: 3px; }
      .highlight { font-weight: 500; }
      .ol-list { padding-left: 25px; margin: 5px 0; }
      .ol-list li { margin-bottom: 2px; }
      .ol-list li.strong { font-weight: 600; }
      .contract-body { font-size: 14px; line-height: 1.5; }
      .contract-indent { text-indent: 45px; margin-bottom: 6px; }
      .contract-heading { font-weight: 600; margin-top: 12px; margin-bottom: 6px; }
      .contract-paragraph { text-indent: 45px; margin-bottom: 6px; }
      .contract-line { margin-bottom: 4px; }
      .contract-item { margin-left: 45px; padding-left: 34px; text-indent: -34px; margin-bottom: 4px; }
      .contract-item2 { margin-left: 75px; padding-left: 40px; text-indent: -40px; margin-bottom: 4px; }
      .contract-star { margin-left: 45px; font-size: 11px; line-height: 1.3; opacity: 0.9; }
      .contract-list { margin-left: 75px; }
      .signature-section {
        margin-top: 100px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: 10px;
        row-gap: 60px;
      }
      .sig-wrapper { position: relative; display: inline-block; }
      .signature-img {
        position: absolute;
        top: -105px;
        left: 90%;
        transform: translateX(-50%);
        width: 260px;
        height: auto;
        pointer-events: none;
        opacity: 0.95;
      }
      .sig-block { text-align: center; margin-bottom: 10px; font-size: 13px; }
      .note-inline { margin-top: 10px; font-size: 10px; opacity: 0.85; line-height: 1.25; }
    </style>
  </head>
  <body>
    ${sheetsHtml}
  </body>
</html>`;

    const chromiumPath = (await chromium.executablePath()) || (await resolveChromiumExecutablePath());
    const browser = await pwChromium.launch({
      executablePath: chromiumPath,
      args: chromium.args,
      headless: true,
    });
    try {
      const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
      page.setDefaultTimeout(15_000);
      await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });

      return new NextResponse(pdf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=\"${docId}.pdf\"`,
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    const extra =
      String(e instanceof Error ? e.message : e ?? "").includes("Executable doesn't exist")
        ? "\n\nหมายเหตุ: บน Vercel ต้องใช้ chromium ที่ bundle มากับ serverless (เช่น @sparticuz/chromium) หรือย้ายงาน PDF ไป service แยกต่างหาก"
        : "";
    return new NextResponse(`สร้าง PDF ไม่สำเร็จ: ${safeErrorMessage(e)}${extra}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
