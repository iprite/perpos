/**
 * Default label registry for PERPOS.
 *
 * Keys follow the pattern `<domain>.<identifier>` in dot-notation.
 * Super admins can override any key per-org via org_label_overrides table.
 *
 * Frontend usage:
 *   const labels = useOrgLabels();
 *   labels['finance.income'] // → 'ค่าเช่า' (if overridden by org), else 'รายรับ'
 *
 *   Or using the component:
 *   <OrgLabel labelKey="finance.income" />
 */
export const DEFAULT_LABELS: Record<string, string> = {
  // ── Finance ────────────────────────────────────────────────────────────────
  'finance.income':           'รายรับ',
  'finance.expense':          'รายจ่าย',
  'finance.balance':          'ยอดคงเหลือ',
  'finance.entry_date':       'วันที่',
  'finance.note':             'หมายเหตุ',
  'finance.amount':           'จำนวนเงิน',
  'finance.category':         'หมวดหมู่',
  'finance.account':          'บัญชี',
  'finance.payment_method':   'วิธีชำระ',
  'finance.receipt':          'ใบเสร็จ',

  // ── Sales ──────────────────────────────────────────────────────────────────
  'sales.quotation':          'ใบเสนอราคา',
  'sales.invoice':            'ใบแจ้งหนี้',
  'sales.receipt':            'ใบเสร็จรับเงิน',
  'sales.customer':           'ลูกค้า',
  'sales.total':              'ยอดรวม',
  'sales.subtotal':           'ยอดก่อนภาษี',
  'sales.discount':           'ส่วนลด',
  'sales.tax':                'ภาษี',
  'sales.due_date':           'กำหนดชำระ',

  // ── Purchase ───────────────────────────────────────────────────────────────
  'purchase.order':           'ใบสั่งซื้อ',
  'purchase.vendor':          'ผู้ขาย',
  'purchase.expense':         'บันทึกค่าใช้จ่าย',

  // ── Payroll ────────────────────────────────────────────────────────────────
  'payroll.salary':           'เงินเดือน',
  'payroll.employee':         'พนักงาน',
  'payroll.department':       'แผนก',
  'payroll.allowance':        'เงินเพิ่ม',
  'payroll.deduction':        'เงินหัก',
  'payroll.payslip':          'สลิปเงินเดือน',

  // ── Inventory ──────────────────────────────────────────────────────────────
  'inventory.product':        'สินค้า',
  'inventory.stock':          'สต๊อก',
  'inventory.unit':           'หน่วย',
  'inventory.sku':            'รหัสสินค้า',

  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.dashboard':            'แดชบอร์ด',
  'nav.accounting':           'บัญชี',
  'nav.payroll':              'เงินเดือน',
  'nav.sales':                'การขาย',
  'nav.purchase':             'การจัดซื้อ',
  'nav.finance':              'การเงิน',
  'nav.inventory':            'สินค้า',
  'nav.reports':              'รายงาน',
  'nav.settings':             'ตั้งค่า',
  'nav.contacts':             'ผู้ติดต่อ',
  'nav.assistant':            'ผู้ช่วย',
  'nav.tax':                  'ภาษี',

  // ── Common actions ────────────────────────────────────────────────────────
  'action.save':              'บันทึก',
  'action.cancel':            'ยกเลิก',
  'action.delete':            'ลบ',
  'action.edit':              'แก้ไข',
  'action.add':               'เพิ่ม',
  'action.search':            'ค้นหา',
  'action.export':            'ส่งออก',
  'action.print':             'พิมพ์',
  'action.approve':           'อนุมัติ',
  'action.reject':            'ปฏิเสธ',
  'action.confirm':           'ยืนยัน',
  'action.submit':            'ส่ง',
  'action.close':             'ปิด',

  // ── Status ────────────────────────────────────────────────────────────────
  'status.active':            'ใช้งาน',
  'status.inactive':          'ปิดใช้งาน',
  'status.pending':           'รอดำเนินการ',
  'status.in_progress':       'กำลังดำเนินการ',
  'status.approved':          'อนุมัติแล้ว',
  'status.rejected':          'ปฏิเสธ',
  'status.draft':             'ร่าง',
  'status.completed':         'เสร็จสิ้น',
  'status.cancelled':         'ยกเลิก',
  'status.overdue':           'เกินกำหนด',

  // ── Documents ─────────────────────────────────────────────────────────────
  'document.date':            'วันที่เอกสาร',
  'document.number':          'เลขที่',
  'document.reference':       'เลขอ้างอิง',
  'document.notes':           'หมายเหตุ',
  'document.attachment':      'ไฟล์แนบ',

  // ── TMC-specific defaults ─────────────────────────────────────────────────
  'tmc.property':             'ทรัพย์สิน',
  'tmc.tenant':               'ผู้เช่า',
  'tmc.rent':                 'ค่าเช่า',
  'tmc.maintenance':          'ค่าซ่อมบำรุง',
  'tmc.stay':                 'การเข้าพัก',
  'tmc.unit':                 'ยูนิต',
  'tmc.building':             'อาคาร',
  'tmc.contract':             'สัญญา',
};

/** All registered label keys in alphabetical order */
export const ALL_LABEL_KEYS = Object.keys(DEFAULT_LABELS).sort();

/** Get the default value for a key, with fallback to the key itself */
export function getDefaultLabel(key: string): string {
  return DEFAULT_LABELS[key] ?? key;
}
