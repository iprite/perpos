const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, HeadingLevel, BorderStyle,
  WidthType, ShadingType, VerticalAlign, PageNumber, PageBreak,
  LevelFormat, ExternalHyperlink, TabStopType, TabStopPosition,
} = require('/Users/iprite/.nvm/versions/node/v24.14.0/lib/node_modules/docx');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = '/Users/iprite/perpos';

// ─── Helpers ────────────────────────────────────────────────────────────────

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, font: 'Sarabun' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 30, font: 'Sarabun', color: '2563EB' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, font: 'Sarabun', color: '374151' })],
  });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, size: 24, font: 'Sarabun', ...opts })],
  });
}

function bullet(text, opts = {}) {
  return new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 24, font: 'Sarabun', ...opts })],
  });
}

function note(text) {
  return new Paragraph({
    spacing: { after: 120 },
    indent: { left: 360 },
    children: [
      new TextRun({ text: '💡 ', size: 24 }),
      new TextRun({ text, size: 22, font: 'Sarabun', italics: true, color: '6B7280' }),
    ],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function spacer(pts = 200) {
  return new Paragraph({ spacing: { after: pts } });
}

function sectionBadge(text, color = '2563EB') {
  const border = { style: BorderStyle.SINGLE, size: 1, color };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: { top: border, bottom: border, left: border, right: border },
            shading: { fill: 'DBEAFE', type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 180, right: 180 },
            width: { size: 9360, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [new TextRun({ text, bold: true, size: 26, font: 'Sarabun', color })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function twoColTable(rows, colWidths = [2800, 6560]) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map(([left, right], i) =>
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: colWidths[0], type: WidthType.DXA },
            shading: { fill: i === 0 ? 'EFF6FF' : 'F9FAFB', type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: left, size: 22, font: 'Sarabun', bold: i === 0, color: i === 0 ? '1D4ED8' : '111827' })] })],
          }),
          new TableCell({
            borders,
            width: { size: colWidths[1], type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: right, size: 22, font: 'Sarabun' })] })],
          }),
        ],
      })
    ),
  });
}

function cmdTable(rows) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const header = new TableRow({
    children: [
      new TableCell({
        borders, width: { size: 2800, type: WidthType.DXA },
        shading: { fill: '1E3A5F', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: 'คำสั่ง', bold: true, size: 22, font: 'Sarabun', color: 'FFFFFF' })] })],
      }),
      new TableCell({
        borders, width: { size: 3480, type: WidthType.DXA },
        shading: { fill: '1E3A5F', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: 'หน้าที่', bold: true, size: 22, font: 'Sarabun', color: 'FFFFFF' })] })],
      }),
      new TableCell({
        borders, width: { size: 3080, type: WidthType.DXA },
        shading: { fill: '1E3A5F', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: 'ตัวอย่าง', bold: true, size: 22, font: 'Sarabun', color: 'FFFFFF' })] })],
      }),
    ],
  });
  const dataRows = rows.map(([cmd, desc, example], i) =>
    new TableRow({
      children: [
        new TableCell({
          borders, width: { size: 2800, type: WidthType.DXA },
          shading: { fill: i % 2 === 0 ? 'F0F9FF' : 'FFFFFF', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: cmd, size: 20, font: 'Courier New', bold: true, color: '1D4ED8' })] })],
        }),
        new TableCell({
          borders, width: { size: 3480, type: WidthType.DXA },
          shading: { fill: i % 2 === 0 ? 'F0F9FF' : 'FFFFFF', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: desc, size: 22, font: 'Sarabun' })] })],
        }),
        new TableCell({
          borders, width: { size: 3080, type: WidthType.DXA },
          shading: { fill: i % 2 === 0 ? 'F0F9FF' : 'FFFFFF', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: example, size: 20, font: 'Courier New', color: '059669' })] })],
        }),
      ],
    })
  );
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2800, 3480, 3080],
    rows: [header, ...dataRows],
  });
}

function screenshot(filename, altText, widthInches = 6.5) {
  const imgPath = path.join(SCREENSHOT_DIR, filename);
  if (!fs.existsSync(imgPath)) {
    console.warn('Missing:', imgPath);
    return para('[ภาพ: ' + filename + ']', { italics: true, color: '9CA3AF' });
  }
  const data = fs.readFileSync(imgPath);
  const w = Math.round(widthInches * 914400);
  // Estimate height from file (we'll use 16:9 ratio for dashboards, 4:3 for others)
  const h = Math.round(w * 0.6);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 160, after: 160 },
    children: [
      new ImageRun({
        type: 'png',
        data,
        transformation: { width: Math.round(widthInches * 96), height: Math.round(widthInches * 96 * 0.6) },
        altText: { title: altText, description: altText, name: altText },
      }),
    ],
  });
}

function imgCaption(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text, size: 20, font: 'Sarabun', italics: true, color: '6B7280' })],
  });
}

function flowBox(steps) {
  const border = { style: BorderStyle.SINGLE, size: 2, color: '2563EB' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const rows = [];
  for (let i = 0; i < steps.length; i++) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill: i % 2 === 0 ? 'EFF6FF' : 'F0F4FF', type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 200, right: 200 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${i + 1}. `, size: 24, font: 'Sarabun', bold: true, color: '2563EB' }),
                  new TextRun({ text: steps[i], size: 24, font: 'Sarabun' }),
                ],
              }),
            ],
          }),
        ],
      })
    );
    if (i < steps.length - 1) {
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
              width: { size: 9360, type: WidthType.DXA },
              margins: { top: 40, bottom: 40, left: 200, right: 200 },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: '▼', size: 28, color: '2563EB' })],
                }),
              ],
            }),
          ],
        })
      );
    }
  }
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows,
  });
}

// ─── Document ────────────────────────────────────────────────────────────────

const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: 'Sarabun', size: 24 } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Sarabun', color: '111827' },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Sarabun', color: '2563EB' },
        paragraph: { spacing: { before: 300, after: 160 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Sarabun', color: '374151' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [
    {
      // ─── Cover page ─────────────────────────────────────────────
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'คู่มือการใช้งาน TMC Management | หน้า ', size: 18, font: 'Sarabun', color: '9CA3AF' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Sarabun', color: '9CA3AF' }),
                new TextRun({ text: ' / ', size: 18, font: 'Sarabun', color: '9CA3AF' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: 'Sarabun', color: '9CA3AF' }),
              ],
            }),
          ],
        }),
      },
      children: [
        // Cover
        spacer(1440),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'TMC Management', size: 72, bold: true, font: 'Sarabun', color: '1E3A5F' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: 'คู่มือการใช้งานระบบ', size: 48, font: 'Sarabun', color: '2563EB' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 },
          children: [new TextRun({ text: 'ระบบบริหารจัดการรีสอร์ท · บัญชี · คลังสินค้า · การเข้าพัก', size: 28, font: 'Sarabun', color: '6B7280' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: '2563EB', space: 1 } },
          spacing: { after: 600 },
          children: [],
        }),
        spacer(400),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text: 'เวอร์ชัน 1.0', size: 24, font: 'Sarabun', color: '9CA3AF' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'พฤษภาคม 2569', size: 24, font: 'Sarabun', color: '9CA3AF' })],
        }),
        pageBreak(),

        // ─── บทนำ ───────────────────────────────────────────────────
        h1('1. ภาพรวมระบบ TMC Management'),
        para('TMC Management คือระบบบริหารจัดการรีสอร์ทแบบครบวงจร ที่ช่วยให้ทีมงานสามารถบันทึกข้อมูลการเข้าพัก บัญชีการเงิน เงินสดย่อย และสต็อกสินค้า ได้จากทุกที่ทุกเวลา ผ่านเว็บแอปพลิเคชัน และ LINE Bot'),
        spacer(100),
        h2('1.1 เมนูหลัก'),
        twoColTable([
          ['เมนู', 'หน้าที่'],
          ['Dashboard', 'สรุปภาพรวมบัญชี การเข้าพัก และสต็อก พร้อมกราฟเปรียบเทียบ'],
          ['บัญชีและการเงิน', 'บันทึกรายรับ-รายจ่ายผ่านบัญชีธนาคาร'],
          ['เงินสดย่อย', 'บันทึกการเติมเงินและค่าใช้จ่ายจากกระเป๋าเงินสดย่อย'],
          ['การเข้าพัก', 'บันทึกข้อมูลแขกผู้เข้าพัก ห้อง และบริการต่าง ๆ'],
          ['Stock คลัง', 'ติดตามสต็อกสินค้าและวัตถุดิบ'],
        ]),
        spacer(200),
        h2('1.2 การเข้าสู่ระบบ'),
        para('TMC Management เป็นส่วนหนึ่งของ PERPOS เข้าใช้งานผ่าน https://perpos.io และเลือกเมนู TMC จาก Sidebar ด้านซ้าย'),
        note('ต้องล็อกอินด้วยบัญชี Google หรือ LINE ก่อนใช้งาน'),
        pageBreak(),

        // ─── Dashboard ──────────────────────────────────────────────
        h1('2. Dashboard — สรุปภาพรวม'),
        para('หน้า Dashboard แสดงสรุปข้อมูลทั้งหมดในรูปแบบ card และกราฟ สามารถเลือกช่วงเวลาย้อนหลังได้ 3, 6 หรือ 12 เดือน'),
        spacer(100),
        screenshot('tmc-dashboard.png', 'หน้า Dashboard', 6.3),
        imgCaption('รูปที่ 2.1 หน้า Dashboard แสดงสรุปภาพรวม'),
        spacer(200),

        h2('2.1 Card สรุปด้านบน'),
        twoColTable([
          ['Card', 'ข้อมูลที่แสดง'],
          ['รายรับสุทธิ (Net Income)', 'รายรับรวม ลบ รายจ่ายรวม จากบัญชีการเงิน (ไม่รวมเงินสดย่อย)'],
          ['เงินสดย่อยคงเหลือ', 'ยอด Top-up ทั้งหมด ลบ ค่าใช้จ่ายเงินสดย่อยทั้งหมด'],
          ['การเข้าพัก', 'จำนวนห้องพักและจำนวนคืนในช่วงที่เลือก'],
          ['Stock ต่ำ', 'จำนวนรายการสินค้าที่คงเหลือน้อยกว่าหรือเท่ากับ 5 หน่วย'],
        ]),
        spacer(200),

        h2('2.2 กราฟแสดงผล'),
        bullet('บัญชีการเงิน — Bar chart รายรับ/รายจ่ายแยกตามเดือน'),
        bullet('เงินสดย่อย — Bar chart เติมเงิน/รายจ่ายแยกตามเดือน'),
        bullet('การเข้าพัก — Bar chart จำนวนห้องและรายได้จากการพักแยกตามเดือน'),
        spacer(200),

        h2('2.3 สรุปตามแปลง (By Property)'),
        para('ตารางแสดงรายรับ รายจ่าย และจำนวนผู้เข้าพักแยกตามแปลง/ห้อง พร้อม Horizontal Bar Chart สำหรับเปรียบเทียบ'),
        spacer(200),

        h2('2.4 สรุปตามหมวด (By Category)'),
        para('ตารางแสดงรายรับ/รายจ่ายแยกตามหมวดหมู่บัญชี เช่น ค่าห้อง ค่าอาหาร ค่ามัดจำ'),
        spacer(200),

        h2('2.5 การกรองช่วงเวลา'),
        para('ใช้ Dropdown "ช่วงเวลา" ที่มุมบนขวาเพื่อเลือกข้อมูลย้อนหลัง:'),
        bullet('3 เดือนล่าสุด'),
        bullet('6 เดือนล่าสุด'),
        bullet('12 เดือนล่าสุด'),
        pageBreak(),

        // ─── Finance ────────────────────────────────────────────────
        h1('3. บัญชีและการเงิน'),
        para('บัญชีและการเงินใช้สำหรับบันทึกรายรับ-รายจ่ายผ่านบัญชีธนาคาร เช่น กสิกร ออมทรัพย์ กสิกร กระแสรายวัน'),
        spacer(100),
        screenshot('tmc-finance.png', 'หน้าบัญชีและการเงิน', 6.3),
        imgCaption('รูปที่ 3.1 หน้าบัญชีและการเงิน'),
        spacer(200),

        h2('3.1 ส่วนประกอบหลัก'),
        bullet('สรุปยอด — แสดงรายรับรวม รายจ่ายรวม และยอดสุทธิของช่วงเวลาที่กรอง'),
        bullet('ตัวกรอง — กรองตามบัญชี วันที่เริ่มต้น และวันที่สิ้นสุด'),
        bullet('ตาราง — แสดงรายการ 10 แถวต่อหน้า พร้อม Pagination ด้านล่าง'),
        bullet('ปุ่ม + เพิ่มรายการ — เปิด Dialog สำหรับเพิ่มรายการใหม่'),
        spacer(200),

        h2('3.2 การเพิ่มรายการ'),
        h3('ขั้นตอนการบันทึกรายการ'),
        flowBox([
          'คลิกปุ่ม "+ เพิ่มรายการ" ที่มุมบนขวา',
          'เลือกบัญชี (กสิกร ออมทรัพย์ / กระแสรายวัน)',
          'เลือกวันที่บันทึก',
          'กรอกรายละเอียด (คำอธิบาย)',
          'เลือกหมวดหมู่ เช่น ค่าห้อง ค่าอาหาร ค่าน้ำมัน',
          'เลือกแปลง/ห้อง (ถ้ามี)',
          'กรอกยอดรายรับ (Income) หรือ รายจ่าย (Expense)',
          'กด "บันทึก"',
        ]),
        spacer(200),

        h2('3.3 การแก้ไขและลบรายการ'),
        bullet('กดไอคอน ✏️ เพื่อแก้ไขรายการ'),
        bullet('กดไอคอน 🗑️ เพื่อลบรายการ (ต้องการสิทธิ์ Management ขึ้นไป)'),
        spacer(200),

        h2('3.4 Field ในแบบฟอร์ม'),
        twoColTable([
          ['Field', 'คำอธิบาย'],
          ['บัญชี *', 'บัญชีธนาคารที่บันทึก (ไม่รวมเงินสดย่อย)'],
          ['วันที่ *', 'วันที่เกิดรายการ'],
          ['รายละเอียด *', 'คำอธิบายรายการ'],
          ['หมวดหมู่', 'ประเภทรายการ เช่น ค่าห้อง ค่าอาหาร'],
          ['แปลง/ห้อง', 'รหัสแปลงหรือห้อง (ถ้าเกี่ยวข้อง)'],
          ['รายรับ (฿)', 'ยอดเงินรับเข้า (กรอกอย่างใดอย่างหนึ่ง)'],
          ['รายจ่าย (฿)', 'ยอดเงินจ่ายออก (กรอกอย่างใดอย่างหนึ่ง)'],
          ['หมายเหตุ', 'ข้อมูลเพิ่มเติม'],
        ]),
        spacer(200),

        h2('3.5 หมวดหมู่ที่ใช้บ่อย'),
        bullet('ค่าห้อง'),
        bullet('ค่าอาหาร / ค่าเครื่องดื่ม'),
        bullet('ค่ามัดจำ / คืนเงินมัดจำ'),
        bullet('ค่าน้ำ / ค่าไฟ'),
        bullet('ค่าจ้างพนักงาน'),
        bullet('รายได้อื่น ๆ'),
        note('รายการมัดจำจากหน้าการเข้าพักจะถูกบันทึกลงบัญชีการเงินโดยอัตโนมัติ'),
        pageBreak(),

        // ─── Petty Cash ─────────────────────────────────────────────
        h1('4. เงินสดย่อย'),
        para('เงินสดย่อย (Petty Cash) ใช้บันทึกค่าใช้จ่ายเล็กน้อยที่จ่ายสดจากกระเป๋า เช่น ค่าวัตถุดิบ ค่าของใช้สิ้นเปลือง โดยแยกออกจากบัญชีธนาคารหลัก'),
        spacer(100),
        screenshot('tmc-petty-cash.png', 'หน้าเงินสดย่อย', 6.3),
        imgCaption('รูปที่ 4.1 หน้าเงินสดย่อย'),
        spacer(200),

        h2('4.1 ส่วนประกอบหลัก'),
        bullet('Card สรุปยอด — ยอดเติมเงินรวม ยอดใช้จ่ายรวม และยอดคงเหลือ'),
        bullet('ตัวกรอง — กรองตามประเภทรายการ วันที่ และแปลง'),
        bullet('ตาราง — แสดงรายการ 10 แถวต่อหน้า'),
        bullet('ปุ่ม + เพิ่มรายการ — เปิด Dialog สำหรับบันทึกรายการใหม่'),
        spacer(200),

        h2('4.2 ประเภทรายการ'),
        twoColTable([
          ['ประเภท', 'ความหมาย'],
          ['เติมเงิน (Top-up)', 'เพิ่มเงินเข้ากระเป๋าเงินสดย่อย เช่น เบิกเงินจากบัญชีมาไว้ที่กระเป๋า'],
          ['รายจ่าย (Expense)', 'บันทึกการใช้จ่ายจากกระเป๋าเงินสดย่อย'],
        ]),
        spacer(200),

        h2('4.3 ขั้นตอนการบันทึก'),
        flowBox([
          'คลิกปุ่ม "+ เพิ่มรายการ"',
          'เลือกประเภท: เติมเงิน หรือ รายจ่าย',
          'เลือกวันที่',
          'กรอกจำนวนเงิน',
          'กรอกรายละเอียด/หมวดหมู่',
          'เลือกแปลง/ห้อง (ถ้ามี)',
          'กด "บันทึก"',
        ]),
        spacer(200),

        h2('4.4 Field ในแบบฟอร์ม'),
        twoColTable([
          ['Field', 'คำอธิบาย'],
          ['ประเภท *', 'เติมเงิน หรือ รายจ่าย'],
          ['วันที่ *', 'วันที่เกิดรายการ'],
          ['จำนวนเงิน *', 'จำนวนเงินที่เติมหรือจ่าย'],
          ['หมวดหมู่', 'เช่น ค่าวัตถุดิบ ค่าอาหาร ค่าของสิ้นเปลือง'],
          ['แปลง/ห้อง', 'แปลงหรือห้องที่เกี่ยวข้อง (ถ้ามี)'],
          ['หมายเหตุ', 'ข้อมูลเพิ่มเติม'],
        ]),
        note('ยอดคงเหลือในหน้า Dashboard คำนวณจาก Top-up รวม ลบ Expense รวม'),
        pageBreak(),

        // ─── Stays ──────────────────────────────────────────────────
        h1('5. การเข้าพัก'),
        para('หน้าการเข้าพักใช้บันทึกข้อมูลแขกผู้เข้าพัก วันที่เช็คอิน-เช็คเอาท์ อัตราค่าห้อง บริการอาหาร และเงินมัดจำ'),
        spacer(100),
        screenshot('tmc-stays.png', 'หน้าการเข้าพัก', 6.3),
        imgCaption('รูปที่ 5.1 หน้าการเข้าพัก'),
        spacer(200),

        h2('5.1 ส่วนประกอบหลัก'),
        bullet('สรุปด้านบน — จำนวนห้องพักในช่วงที่กรอง และรายรับรวม'),
        bullet('ตัวกรอง — กรองตามแปลง ช่วงเช็คอิน ประเภทการพัก ช่องทางการจอง'),
        bullet('การ์ด — แสดงข้อมูลการเข้าพักแต่ละรายการ'),
        bullet('ปุ่ม + บันทึกการเข้าพัก — เปิด Dialog'),
        spacer(200),

        h2('5.2 การบันทึกการเข้าพักใหม่'),
        h3('ขั้นตอน'),
        flowBox([
          'คลิกปุ่ม "+ บันทึกการเข้าพัก"',
          'กรอกข้อมูลแขก: ชื่อ-นามสกุล ชื่อเล่น เบอร์โทร',
          'เลือกแปลง/ห้อง',
          'เลือกวันเช็คอิน และ เช็คเอาท์',
          'เลือกเวลาเช็คอิน-เช็คเอาท์ (ถ้ามี)',
          'เลือกช่องทางการจอง (Walk-in, Airbnb, Agoda ฯลฯ)',
          'เลือกประเภทการพัก (ชำระเงิน, Influencer, บ้านพักผ่อน)',
          'กรอกอัตราค่าห้อง และส่วนลด (ถ้ามี)',
          'กรอกข้อมูลเงินมัดจำ (ถ้ามี)',
          'กรอกข้อมูลบริการ: อาหาร เครื่องดื่ม มูกาตะ BBQ',
          'กด "บันทึก"',
        ]),
        spacer(200),

        h2('5.3 Field ในแบบฟอร์ม'),
        h3('ข้อมูลแขก'),
        twoColTable([
          ['Field', 'คำอธิบาย'],
          ['ชื่อ *', 'ชื่อจริงของแขก'],
          ['นามสกุล', 'นามสกุลของแขก'],
          ['ชื่อเล่น', 'ชื่อเล่น (ใช้แสดงผลแทนชื่อ-นามสกุล)'],
          ['เบอร์โทร', 'เบอร์โทรศัพท์ (ใช้ค้นหาแขกที่เคยพักมาแล้ว)'],
        ]),
        spacer(120),
        h3('ข้อมูลการพัก'),
        twoColTable([
          ['Field', 'คำอธิบาย'],
          ['แปลง/ห้อง *', 'รหัสแปลงหรือห้องพัก'],
          ['วันเช็คอิน *', 'วันที่เข้าพัก'],
          ['วันเช็คเอาท์ *', 'วันที่ออก'],
          ['เวลาเช็คอิน', 'เวลาเข้าพัก (HH:MM)'],
          ['เวลาเช็คเอาท์', 'เวลาออก (HH:MM)'],
          ['ช่องทางการจอง', 'Walk-in / LINE / Airbnb / Agoda / Booking.com ฯลฯ'],
          ['ประเภทการพัก', 'Paid / Influencer / Owner'],
          ['อัตราค่าห้อง (฿)', 'ราคาค่าห้องรวมทั้งหมด'],
          ['ส่วนลด (%)', 'เปอร์เซ็นต์ส่วนลด (ถ้ามี)'],
        ]),
        spacer(120),
        h3('💵 เงินมัดจำ'),
        twoColTable([
          ['Field', 'คำอธิบาย'],
          ['รับมัดจำ (฿)', 'จำนวนเงินมัดจำที่รับจากแขก — จะบันทึกลงบัญชีการเงินอัตโนมัติ'],
          ['คืนมัดจำ (฿)', 'จำนวนเงินมัดจำที่คืนให้แขก — จะบันทึกลงบัญชีการเงินอัตโนมัติ'],
          ['บัญชีรับ/คืนมัดจำ', 'บัญชีที่ใช้รับหรือคืนเงินมัดจำ'],
        ]),
        note('เมื่อบันทึกเงินมัดจำ ระบบจะสร้างรายการบัญชีการเงินให้อัตโนมัติ: "รับมัดจำ – ชื่อแขก (แปลง)" หรือ "คืนมัดจำ – ชื่อแขก (แปลง)"'),
        spacer(120),
        h3('บริการเพิ่มเติม'),
        twoColTable([
          ['Field', 'คำอธิบาย'],
          ['จำนวนแขก', 'จำนวนผู้เข้าพักทั้งหมด'],
          ['ประเภทกลุ่ม', 'ครอบครัว / คู่รัก / เพื่อน ฯลฯ'],
          ['Butler Service', 'รายละเอียดบริการพิเศษ'],
          ['ค่าอาหาร (฿)', 'ยอดค่าอาหาร'],
          ['ค่าเครื่องดื่ม (฿)', 'ยอดค่าเครื่องดื่ม'],
          ['มูกาตะ (฿)', 'ยอดค่ามูกาตะ'],
          ['BBQ (฿)', 'ยอดค่า BBQ'],
          ['กิจกรรม', 'รายละเอียดกิจกรรมพิเศษ'],
          ['Feedback', 'ความคิดเห็นจากแขก'],
          ['ปัญหา', 'ปัญหาที่พบระหว่างการพัก'],
          ['ทรัพย์สินเสียหาย', 'รายละเอียดทรัพย์สินที่เสียหาย (ถ้ามี)'],
        ]),
        spacer(200),

        h2('5.4 Workflow เงินมัดจำ'),
        flowBox([
          'แขกจ่ายมัดจำก่อนเช็คอิน → บันทึก "รับมัดจำ" ในฟอร์มการเข้าพัก',
          'ระบบสร้างรายการ "รายรับ: ค่ามัดจำ" ในบัญชีการเงินโดยอัตโนมัติ',
          'วันเช็คเอาท์ → ตรวจสอบทรัพย์สิน',
          'ไม่มีความเสียหาย → บันทึก "คืนมัดจำ" ในหน้าแก้ไขการเข้าพัก',
          'ระบบสร้างรายการ "รายจ่าย: คืนเงินมัดจำ" ในบัญชีการเงินโดยอัตโนมัติ',
        ]),
        pageBreak(),

        // ─── Stock ──────────────────────────────────────────────────
        h1('6. Stock คลัง'),
        para('หน้า Stock คลังใช้สำหรับติดตามสต็อกสินค้าและวัตถุดิบของรีสอร์ท เช่น อาหาร เครื่องดื่ม ของใช้ในห้องพัก'),
        spacer(100),
        screenshot('tmc-stock.png', 'หน้า Stock คลัง', 6.3),
        imgCaption('รูปที่ 6.1 หน้า Stock คลัง'),
        spacer(200),

        h2('6.1 ส่วนประกอบหลัก'),
        bullet('ตัวกรอง — ค้นหาตามชื่อสินค้า หมวดหมู่'),
        bullet('ตาราง/การ์ดสินค้า — แสดงชื่อสินค้า หน่วย และจำนวนคงเหลือ'),
        bullet('แถบเตือน Stock ต่ำ — สินค้าที่คงเหลือ ≤ 5 หน่วย จะแสดงสีแดง'),
        bullet('ปุ่ม + เพิ่มสินค้า — เพิ่มรายการสินค้าใหม่'),
        spacer(200),

        h2('6.2 การจัดการสต็อก'),
        twoColTable([
          ['การดำเนินการ', 'วิธีใช้งาน'],
          ['เพิ่มสินค้าใหม่', 'คลิก "+ เพิ่มสินค้า" กรอกชื่อ หน่วย และจำนวนเริ่มต้น'],
          ['ปรับจำนวนสต็อก', 'คลิกไอคอน ✏️ และแก้ไขจำนวนคงเหลือ'],
          ['บันทึกการรับของ', 'เพิ่มจำนวนในช่อง current_stock'],
          ['บันทึกการใช้ของ', 'ลดจำนวนในช่อง current_stock'],
          ['ดูสินค้าใกล้หมด', 'ดูได้จาก Dashboard → Card Stock ต่ำ'],
        ]),
        spacer(200),

        h2('6.3 การแจ้งเตือน Stock ต่ำ'),
        para('Dashboard จะแสดงรายการสินค้าที่คงเหลือน้อยกว่าหรือเท่ากับ 5 หน่วย ในส่วน "Stock ใกล้หมด" เพื่อให้ทีมงานสั่งของทันเวลา'),
        pageBreak(),

        // ─── LINE Bot ───────────────────────────────────────────────
        h1('7. LINE Bot — คำสั่งผ่าน LINE'),
        para('TMC Management รองรับการบันทึกข้อมูลผ่าน LINE Bot โดยพิมพ์คำสั่งในแชท LINE ที่เชื่อมต่อกับระบบ ทุกคำสั่งต้องขึ้นต้นด้วย /'),
        spacer(100),

        sectionBadge('⚠️ ข้อกำหนด: ต้องผูกบัญชี LINE กับระบบก่อนใช้งาน (ดูหัวข้อ 7.1)'),
        spacer(200),

        h2('7.1 การผูกบัญชี LINE'),
        flowBox([
          'เข้าสู่ระบบที่ https://perpos.io',
          'ไปที่การตั้งค่าบัญชี → เชื่อมต่อ LINE',
          'คัดลอก Token ที่ได้รับ',
          'ส่งคำสั่ง /link <token> ใน LINE Bot',
          'ระบบยืนยัน "ผูกบัญชีสำเร็จ"',
        ]),
        spacer(200),

        h2('7.2 คำสั่ง TMC การเงิน'),
        cmdTable([
          ['/รับ <จำนวน> [รายละเอียด]', 'บันทึกรายรับเข้าบัญชีกสิกร ออมทรัพย์', '/รับ 5000 ค่าห้องแขก'],
          ['/รับ <จำนวน> @กระแส [รายละเอียด]', 'บันทึกรายรับเข้าบัญชีกระแสรายวัน', '/รับ 3000 @กระแส โอนเงิน'],
          ['/จ่าย <จำนวน> [รายละเอียด]', 'บันทึกรายจ่ายออกจากบัญชีออมทรัพย์', '/จ่าย 1200 ค่าน้ำมัน'],
          ['/จ่าย <จำนวน> @กระแส [รายละเอียด]', 'บันทึกรายจ่ายออกจากบัญชีกระแส', '/จ่าย 500 @กระแส ค่าไฟ'],
          ['/บัญชี', 'ดูยอดสรุปทุกบัญชีเดือนนี้', '/บัญชี'],
          ['/บัญชี ออม', 'ดูยอดบัญชีกสิกร ออมทรัพย์', '/บัญชี ออม'],
          ['/บัญชี กระแส', 'ดูยอดบัญชีกระแสรายวัน', '/บัญชี กระแส'],
        ]),
        spacer(200),

        h2('7.3 ตัวอย่างการใช้งาน'),
        h3('บันทึกรายรับค่าห้อง'),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'พิมพ์ใน LINE: ', size: 22, font: 'Sarabun', color: '6B7280' }),
            new TextRun({ text: '/รับ 12000 ค่าห้อง แขกคุณสมชาย', size: 22, font: 'Courier New', bold: true, color: '1D4ED8' }),
          ],
        }),
        para('ระบบตอบกลับ:'),
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 120 },
          children: [new TextRun({ text: '✅ บันทึกรายรับ ฿12,000.00\nออมทรัพย์ (กสิกร) | ค่าห้อง แขกคุณสมชาย\nเดือนนี้: รับ ฿12,000 | จ่าย ฿0 | สุทธิ +฿12,000', size: 22, font: 'Sarabun', color: '059669' })],
        }),
        spacer(160),

        h3('ดูยอดบัญชี'),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'พิมพ์ใน LINE: ', size: 22, font: 'Sarabun', color: '6B7280' }),
            new TextRun({ text: '/บัญชี', size: 22, font: 'Courier New', bold: true, color: '1D4ED8' }),
          ],
        }),
        para('ระบบตอบกลับสรุปยอดทุกบัญชีสำหรับเดือนปัจจุบัน'),
        spacer(200),

        h2('7.4 คำสั่งอื่น ๆ'),
        cmdTable([
          ['/help', 'แสดงคำสั่งทั้งหมดที่ใช้ได้', '/help'],
          ['/tmc help', 'แสดงคำสั่ง TMC โดยเฉพาะ', '/tmc help'],
          ['/t <ข้อความ>', 'บันทึก Task ใหม่', '/t ตรวจสอบห้อง A วันพรุ่งนี้'],
          ['/tk', 'ดู Task ที่รออยู่', '/tk'],
          ['/d <N>', 'ปิด Task ที่ N', '/d 1'],
          ['/นัด <HH:MM> <เรื่อง>', 'เพิ่มนัดวันนี้', '/นัด 14:00 ประชุมทีม'],
          ['/วันนี้', 'ดูนัดหมายวันนี้', '/วันนี้'],
        ]),
        pageBreak(),

        // ─── Tips & FAQ ─────────────────────────────────────────────
        h1('8. เคล็ดลับและคำถามที่พบบ่อย'),

        h2('8.1 เคล็ดลับการใช้งาน'),
        bullet('ใช้ LINE Bot สำหรับบันทึกรายรับ-รายจ่ายด่วน เมื่ออยู่นอกสถานที่'),
        bullet('ตรวจสอบ Dashboard ทุกสัปดาห์เพื่อติดตามภาพรวมธุรกิจ'),
        bullet('บันทึกเงินมัดจำทุกครั้งที่รับ เพื่อให้บัญชีการเงินถูกต้องอัตโนมัติ'),
        bullet('ใช้ช่อง "แปลง/ห้อง" ให้สม่ำเสมอ เพื่อให้ Dashboard สรุปตามแปลงได้ถูกต้อง'),
        bullet('ตรวจสอบ Stock ต่ำใน Dashboard ก่อนสิ้นสัปดาห์'),
        spacer(200),

        h2('8.2 คำถามที่พบบ่อย'),
        twoColTable([
          ['คำถาม', 'คำตอบ'],
          ['รายการมัดจำหายไปจากบัญชีการเงิน?', 'ตรวจสอบว่ากรอก "รับมัดจำ" ในหน้าการเข้าพักแล้วหรือยัง ระบบจะสร้างรายการให้อัตโนมัติ'],
          ['ยอดเงินสดย่อยไม่ตรง?', 'ตรวจสอบว่าบันทึก Top-up และ Expense ครบถ้วน ยอดคงเหลือ = Top-up รวม - Expense รวม'],
          ['LINE Bot ไม่ตอบสนอง?', 'ตรวจสอบว่าผูกบัญชี LINE แล้ว และคำสั่งขึ้นต้นด้วย /'],
          ['แก้ไขรายการบัญชีได้ไหม?', 'ได้ กดไอคอน ✏️ ที่รายการ สำหรับการลบต้องมีสิทธิ์ Management'],
          ['Dashboard แสดงข้อมูลช่วงไหน?', 'ขึ้นอยู่กับ Dropdown ที่เลือก: 3, 6 หรือ 12 เดือนล่าสุด'],
        ]),
        spacer(200),

        h2('8.3 สิทธิ์การใช้งาน'),
        twoColTable([
          ['สิทธิ์', 'สามารถทำได้'],
          ['Member', 'ดูข้อมูล, บันทึกรายการใหม่'],
          ['Management', 'ดู, บันทึก, แก้ไข, ลบรายการ'],
          ['Admin / Owner', 'ทุกสิทธิ์ + ตั้งค่าระบบ'],
        ]),
        spacer(400),

        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB', space: 1 } },
          spacing: { before: 400, after: 120 },
          children: [new TextRun({ text: 'สำหรับความช่วยเหลือเพิ่มเติม ติดต่อทีมงาน PERPOS', size: 22, font: 'Sarabun', color: '9CA3AF', italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'https://perpos.io', size: 22, font: 'Sarabun', color: '2563EB' })],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = '/Users/iprite/perpos/TMC-Management-Manual.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('✅ Created:', outPath, '(' + Math.round(buffer.length / 1024) + ' KB)');
}).catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
