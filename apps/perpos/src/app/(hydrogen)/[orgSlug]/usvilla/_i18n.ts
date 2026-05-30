export type Lang = 'th' | 'en' | 'cn';

export const LANG_OPTIONS: { code: Lang; label: string; flag: string }[] = [
  { code: 'th', label: 'ไทย', flag: '🇹🇭' },
  { code: 'en', label: 'EN',  flag: '🇬🇧' },
  { code: 'cn', label: '中文', flag: '🇨🇳' },
];

const STORAGE_KEY = 'usvilla_lang';

export function getSavedLang(): Lang {
  if (typeof window === 'undefined') return 'th';
  return (localStorage.getItem(STORAGE_KEY) as Lang) || 'th';
}
export function saveLang(lang: Lang) {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
}

// ── Translation dictionary ────────────────────────────────────────────────────

type Dict = typeof TH;

const TH = {
  // Sidebar / nav
  nav_daily:    'รายวัน',
  nav_calendar: 'ปฏิทิน',
  nav_sheet:    'บันทึกประจำวัน',
  nav_report:   'รายงานรายได้',

  // Page titles
  title_daily:      'PMS — Us Villa',
  subtitle_daily:   'สถานะห้องพักและการเข้าพักประจำวัน',
  title_calendar:   'ปฏิทินการเข้าพัก',
  subtitle_calendar:'Us Villa · Room Availability Calendar',
  title_sheet:      'บันทึกการเข้าพักประจำวัน',
  subtitle_sheet:   'Us Villa · Daily Operations Sheet',
  title_report:     'รายงานรายได้ประจำวัน',
  subtitle_report:  'Us Villa · 营业收入日报表',

  // Buttons
  btn_checkin:   'Booking',
  btn_checkout:  'Check-out',
  btn_cancel:    'ยกเลิก',
  btn_save:      'บันทึก',
  btn_saving:    'กำลังบันทึก…',
  btn_confirm:   'ยืนยัน',
  btn_close:     'ปิด',
  btn_refresh:   'รีเฟรช',
  btn_print:     'พิมพ์',
  btn_add:       'เพิ่ม',
  btn_today:     'วันนี้',
  btn_add_pay:   'เพิ่มการชำระเงิน',

  // Room grid
  room_status_today: 'สถานะห้องพักวันนี้',
  room_type_a: 'A Room',
  room_type_v: 'V Room',
  room_type_c: 'C Room',
  room_label:  'ห้อง',
  status_occupied:    'เข้าพักอยู่',
  status_available:   'ว่าง',
  status_reserved:    'จอง',
  status_maintenance: 'ปิดซ่อม',
  status_checked_out: 'เช็คเอาท์แล้ว',
  status_cancelled:   'ยกเลิก',

  // Stats
  stat_occupied:  'ห้องที่เข้าพัก',
  stat_available: 'ห้องว่าง',
  stat_revenue:   'ยอดวัน',

  // Table columns
  col_room:        'ห้อง',
  col_guest:       'ชื่อแขก',
  col_nationality: 'สัญชาติ',
  col_type:        'ประเภท',
  col_checkin:     'เช็คอิน',
  col_checkout:    'เช็คเอาท์',
  col_amount:      'ยอด (฿)',
  col_status:      'สถานะ',
  col_nights:      'คืน',
  col_subtotal:    'รวม (฿)',

  // Stay types
  stay_daily:  'รายวัน',
  stay_daily_long: 'รายวัน (Daily)',
  stay_hourly: 'ชั่วคราว 3 ชั่วโมง',

  // Booking form
  field_room:        'ห้อง',
  field_guest:       'ชื่อแขก',
  field_nationality: 'สัญชาติ',
  field_stay_type:   'ประเภทพัก',
  field_checkin_date: 'วันที่เช็คอิน',
  field_checkin_time: 'เวลาเช็คอิน',
  field_checkout_date:'วันที่เช็คเอาท์',
  field_nights:       'จำนวนคืน',
  field_payment:      'การชำระเงิน',
  field_notes:        'หมายเหตุ',
  field_method:       'ช่องทางชำระ',
  field_amount:       'จำนวนเงิน (฿)',

  ph_guest:  'ชื่อ-นามสกุล',
  ph_notes:  'หมายเหตุ (ถ้ามี)',
  ph_amount: '0.00',
  ph_select_room: '— เลือกห้อง —',
  ph_select_date: 'เลือกวัน',

  // Payment methods
  pay_cash:    'เงินสด',
  pay_qr:      'QR / เงินโอน',
  pay_credit:  'บัตรเครดิต',
  pay_trip:    'Trip.com',
  pay_agoda:   'Agoda',
  pay_expedia: 'Expedia',
  pay_wechat:  'WeChat',
  pay_alipay:  'AliPay',

  // Nationality options
  nat_th:    'ไทย',
  nat_cn:    'จีน',
  nat_jp:    'ญี่ปุ่น',
  nat_kr:    'เกาหลี',
  nat_en:    'อังกฤษ',
  nat_us:    'อเมริกา',
  nat_other: 'อื่นๆ',

  // Units
  unit_night: 'คืน',
  unit_hour:  'ชม.',
  unit_rooms: 'ห้อง',

  // Empty states
  no_bookings: 'ไม่มีการเข้าพักในวันนี้',
  no_payment:  'ยังไม่มีรายการ',
  not_set:     'ยังไม่ได้กำหนด',

  // Dialogs
  dlg_checkin_title:   'Check-in ใหม่',
  dlg_checkout_title:  'ยืนยัน Check-out',
  dlg_cancel_title:    'ยืนยันยกเลิกการเข้าพัก',
  dlg_add_pay_title:   'เพิ่มการชำระเงิน',
  dlg_checkout_time:   'เวลา',
  dlg_cancel_confirm:  (name: string, room: string) => `ยกเลิกการเข้าพักของ ${name} ห้อง ${room}?`,
  dlg_cancel_btn:      'ยืนยันยกเลิก',
  dlg_checkin_btn:     'Check-in',

  // Detail dialog labels
  detail_guest:    'แขก',
  detail_stay:     'ประเภทพัก',
  detail_checkin:  'เช็คอิน',
  detail_checkout: 'เช็คเอาท์',
  detail_payment:  'ยอดชำระ',
  detail_total:    'รวม',

  // Daily sheet
  sheet_head:          'บันทึกการเข้าพักประจำวัน',
  sheet_col_stay:      'เข้าพัก',
  sheet_col_checkin:   'เช็คอิน',
  sheet_col_checkout:  'เช็คเอาท์',
  sheet_subtotal:      (type: string, n: number) => `รวม ${type} (${n} ห้อง)`,
  sheet_grand_total:   (n: number) => `ยอดรวมทั้งหมด (${n} ห้อง)`,
  sheet_method_sum:    'สรุปแยกช่องทาง',
  sheet_vacant:        (n: number) => `ว่าง ${n} ห้อง`,
  sheet_occupied:      (n: number) => `เข้าพัก ${n} ห้อง`,

  // Dashboard
  dash_subtitle:       '营业收入日报表',
  dash_total_rooms:    (n: number) => `ห้องทั้งหมด ${n} ห้อง`,
  dash_kpi_rooms:      'ห้องที่เข้าพัก',
  dash_kpi_revenue:    'รายได้รวม (฿)',
  dash_kpi_occupancy:  'อัตราการเข้าพัก',
  dash_kpi_revpar:     'RevPAR (฿)',
  dash_daily_label:    'วันนี้',
  dash_monthly_label:  'สะสมเดือนนี้',
  dash_revenue_type:   'รายได้แยกประเภทห้อง',
  dash_col_opened:     'เปิดห้อง (วันนี้)',
  dash_col_rev_day:    'รายได้วันนี้ (฿)',
  dash_col_rev_month:  'สะสมเดือนนี้ (฿)',
  dash_total_row:      'รวม (ห้องพักรวม)',
  dash_occupancy:      'สถิติการเข้าพัก',
  dash_stat_opened:    'จำนวนห้องที่เปิด',
  dash_stat_available: 'ห้องว่าง (ทั้งหมด)',
  dash_stat_rate:      'อัตราเข้าพัก',
  dash_stat_adr:       'ราคาเฉลี่ย (ADR)',
  dash_stat_revpar:    'RevPAR',
  dash_sources:        'ที่มาของการจอง (วันนี้)',
  dash_src_direct:     'ตรง (Walk-in / Direct)',
  dash_payment:        'สรุปแยกช่องทางชำระเงิน 付款方式',
  dash_pay_total:      'รวมทั้งหมด (小计)',
  dash_balance:        'ยอดสมดุล (平衡)',

  // Errors
  err_select_room: 'กรุณาเลือกห้อง',
  err_enter_guest: 'กรุณากรอกชื่อแขก',
  err_enter_amount:'กรุณากรอกจำนวนเงิน',
  err_no_org:      'ไม่พบข้อมูลองค์กร',
  err_relogin:     'กรุณาเข้าสู่ระบบใหม่',
  err_load_fail:   'โหลดข้อมูลล้มเหลว',
  err_room_taken:  'ห้องนี้มีแขกเข้าพักอยู่แล้ว',
};

const EN: Dict = {
  nav_daily:    'Daily',
  nav_calendar: 'Calendar',
  nav_sheet:    'Daily Sheet',
  nav_report:   'Revenue Report',

  title_daily:      'PMS — Us Villa',
  subtitle_daily:   'Room Status & Daily Occupancy',
  title_calendar:   'Room Availability Calendar',
  subtitle_calendar:'Us Villa · Room Availability Calendar',
  title_sheet:      'Daily Operations Sheet',
  subtitle_sheet:   'Us Villa · Daily Operations Sheet',
  title_report:     'Daily Revenue Report',
  subtitle_report:  'Us Villa · Daily Revenue Report',

  btn_checkin:   'Booking',
  btn_checkout:  'Check-out',
  btn_cancel:    'Cancel',
  btn_save:      'Save',
  btn_saving:    'Saving…',
  btn_confirm:   'Confirm',
  btn_close:     'Close',
  btn_refresh:   'Refresh',
  btn_print:     'Print',
  btn_add:       'Add',
  btn_today:     'Today',
  btn_add_pay:   'Add Payment',

  room_status_today: "Today's Room Status",
  room_type_a: 'A Room',
  room_type_v: 'V Room',
  room_type_c: 'C Room',
  room_label:  'Room',
  status_occupied:    'Occupied',
  status_available:   'Available',
  status_reserved:    'Reserved',
  status_maintenance: 'Maintenance',
  status_checked_out: 'Checked Out',
  status_cancelled:   'Cancelled',

  stat_occupied:  'Occupied Rooms',
  stat_available: 'Available Rooms',
  stat_revenue:   "Today's Revenue",

  col_room:        'Room',
  col_guest:       'Guest Name',
  col_nationality: 'Nationality',
  col_type:        'Type',
  col_checkin:     'Check-in',
  col_checkout:    'Check-out',
  col_amount:      'Amount (฿)',
  col_status:      'Status',
  col_nights:      'Nights',
  col_subtotal:    'Total (฿)',

  stay_daily:      'Daily',
  stay_daily_long: 'Daily Stay',
  stay_hourly:     '3-Hour Short Stay',

  field_room:          'Room',
  field_guest:         'Guest Name',
  field_nationality:   'Nationality',
  field_stay_type:     'Stay Type',
  field_checkin_date:  'Check-in Date',
  field_checkin_time:  'Check-in Time',
  field_checkout_date: 'Check-out Date',
  field_nights:        'Nights',
  field_payment:       'Payment',
  field_notes:         'Notes',
  field_method:        'Payment Method',
  field_amount:        'Amount (฿)',

  ph_guest:       'Full name',
  ph_notes:       'Notes (optional)',
  ph_amount:      '0.00',
  ph_select_room: '— Select Room —',
  ph_select_date: 'Select date',

  pay_cash:    'Cash',
  pay_qr:      'QR / Transfer',
  pay_credit:  'Credit Card',
  pay_trip:    'Trip.com',
  pay_agoda:   'Agoda',
  pay_expedia: 'Expedia',
  pay_wechat:  'WeChat',
  pay_alipay:  'AliPay',

  nat_th:    'Thai',
  nat_cn:    'Chinese',
  nat_jp:    'Japanese',
  nat_kr:    'Korean',
  nat_en:    'British',
  nat_us:    'American',
  nat_other: 'Other',

  unit_night: 'night(s)',
  unit_hour:  'hr.',
  unit_rooms: 'rooms',

  no_bookings: 'No check-ins today',
  no_payment:  'No payment recorded',
  not_set:     'Not set',

  dlg_checkin_title:  'New Check-in',
  dlg_checkout_title: 'Confirm Check-out',
  dlg_cancel_title:   'Confirm Cancellation',
  dlg_add_pay_title:  'Add Payment',
  dlg_checkout_time:  'Time',
  dlg_cancel_confirm: (name: string, room: string) => `Cancel stay for ${name} in room ${room}?`,
  dlg_cancel_btn:     'Confirm Cancel',
  dlg_checkin_btn:    'Check-in',

  detail_guest:    'Guest',
  detail_stay:     'Stay Type',
  detail_checkin:  'Check-in',
  detail_checkout: 'Check-out',
  detail_payment:  'Payment',
  detail_total:    'Total',

  sheet_head:         'Daily Occupancy Record',
  sheet_col_stay:     'Stay',
  sheet_col_checkin:  'Check-in',
  sheet_col_checkout: 'Check-out',
  sheet_subtotal:     (type: string, n: number) => `${type} Subtotal (${n} rooms)`,
  sheet_grand_total:  (n: number) => `Grand Total (${n} rooms)`,
  sheet_method_sum:   'Payment Method Summary',
  sheet_vacant:       (n: number) => `${n} vacant`,
  sheet_occupied:     (n: number) => `${n} occupied`,

  dash_subtitle:       'Daily Revenue Report',
  dash_total_rooms:    (n: number) => `${n} Rooms Total`,
  dash_kpi_rooms:      'Occupied Rooms',
  dash_kpi_revenue:    'Total Revenue (฿)',
  dash_kpi_occupancy:  'Occupancy Rate',
  dash_kpi_revpar:     'RevPAR (฿)',
  dash_daily_label:    'Today',
  dash_monthly_label:  'Month-to-Date',
  dash_revenue_type:   'Revenue by Room Type',
  dash_col_opened:     'Rooms Opened (Today)',
  dash_col_rev_day:    "Today's Revenue (฿)",
  dash_col_rev_month:  'Monthly Cumulative (฿)',
  dash_total_row:      'Total',
  dash_occupancy:      'Occupancy Statistics',
  dash_stat_opened:    'Rooms Opened',
  dash_stat_available: 'Total Available Rooms',
  dash_stat_rate:      'Occupancy Rate',
  dash_stat_adr:       'Average Daily Rate (ADR)',
  dash_stat_revpar:    'RevPAR',
  dash_sources:        "Booking Sources (Today)",
  dash_src_direct:     'Walk-in / Direct',
  dash_payment:        'Payment Method Breakdown',
  dash_pay_total:      'Grand Total',
  dash_balance:        'Balance',

  err_select_room:  'Please select a room',
  err_enter_guest:  'Please enter guest name',
  err_enter_amount: 'Please enter an amount',
  err_no_org:       'Organization not found',
  err_relogin:      'Please sign in again',
  err_load_fail:    'Failed to load data',
  err_room_taken:   'Room is already occupied for this period',
};

const CN: Dict = {
  nav_daily:    '每日',
  nav_calendar: '日历',
  nav_sheet:    '日报表',
  nav_report:   '营业收入',

  title_daily:      'PMS — 优斯别墅',
  subtitle_daily:   '房间状态及当日入住情况',
  title_calendar:   '房间可用日历',
  subtitle_calendar:'优斯别墅 · 房间可用日历',
  title_sheet:      '每日入住记录',
  subtitle_sheet:   '优斯别墅 · 每日入住记录',
  title_report:     '营业收入日报表',
  subtitle_report:  '优斯别墅 · 营业收入日报表',

  btn_checkin:   'Booking',
  btn_checkout:  '退房',
  btn_cancel:    '取消',
  btn_save:      '保存',
  btn_saving:    '保存中…',
  btn_confirm:   '确认',
  btn_close:     '关闭',
  btn_refresh:   '刷新',
  btn_print:     '打印',
  btn_add:       '添加',
  btn_today:     '今日',
  btn_add_pay:   '添加付款',

  room_status_today: '今日房间状态',
  room_type_a: 'A 标准房',
  room_type_v: 'V VIP房',
  room_type_c: 'C 经济房',
  room_label:  '房间',
  status_occupied:    '已入住',
  status_available:   '空房',
  status_reserved:    '已预订',
  status_maintenance: '维修中',
  status_checked_out: '已退房',
  status_cancelled:   '已取消',

  stat_occupied:  '已入住房间',
  stat_available: '空房数',
  stat_revenue:   '当日营业额',

  col_room:        '房间号',
  col_guest:       '姓名',
  col_nationality: '国籍',
  col_type:        '类型',
  col_checkin:     '入住时间',
  col_checkout:    '离店时间',
  col_amount:      '金额 (฿)',
  col_status:      '状态',
  col_nights:      '晚数',
  col_subtotal:    '合计 (฿)',

  stay_daily:      '按天',
  stay_daily_long: '按天入住',
  stay_hourly:     '短住 3 小时',

  field_room:          '房间',
  field_guest:         '客人姓名',
  field_nationality:   '国籍',
  field_stay_type:     '入住类型',
  field_checkin_date:  '入住日期',
  field_checkin_time:  '入住时间',
  field_checkout_date: '离店日期',
  field_nights:        '晚数',
  field_payment:       '付款方式',
  field_notes:         '备注',
  field_method:        '付款方式',
  field_amount:        '金额 (฿)',

  ph_guest:       '姓名',
  ph_notes:       '备注 (可选)',
  ph_amount:      '0.00',
  ph_select_room: '— 选择房间 —',
  ph_select_date: '选择日期',

  pay_cash:    '现金',
  pay_qr:      '扫码/转账',
  pay_credit:  '刷卡',
  pay_trip:    '携程',
  pay_agoda:   'Agoda',
  pay_expedia: 'Expedia',
  pay_wechat:  '微信',
  pay_alipay:  '支付宝',

  nat_th:    '泰国',
  nat_cn:    '中国',
  nat_jp:    '日本',
  nat_kr:    '韩国',
  nat_en:    '英国',
  nat_us:    '美国',
  nat_other: '其他',

  unit_night: '晚',
  unit_hour:  '小时',
  unit_rooms: '间',

  no_bookings: '今日暂无入住记录',
  no_payment:  '暂无付款记录',
  not_set:     '未设置',

  dlg_checkin_title:  '新增入住',
  dlg_checkout_title: '确认退房',
  dlg_cancel_title:   '确认取消入住',
  dlg_add_pay_title:  '添加付款',
  dlg_checkout_time:  '时间',
  dlg_cancel_confirm: (name: string, room: string) => `确认取消 ${name} 在 ${room} 的入住吗？`,
  dlg_cancel_btn:     '确认取消',
  dlg_checkin_btn:    '办理入住',

  detail_guest:    '客人',
  detail_stay:     '入住类型',
  detail_checkin:  '入住时间',
  detail_checkout: '离店时间',
  detail_payment:  '付款情况',
  detail_total:    '合计',

  sheet_head:         '每日入住记录',
  sheet_col_stay:     '入住',
  sheet_col_checkin:  '入住时间',
  sheet_col_checkout: '离店时间',
  sheet_subtotal:     (type: string, n: number) => `${type} 小计 (${n} 间)`,
  sheet_grand_total:  (n: number) => `合计 (${n} 间)`,
  sheet_method_sum:   '付款方式汇总',
  sheet_vacant:       (n: number) => `空房 ${n} 间`,
  sheet_occupied:     (n: number) => `入住 ${n} 间`,

  dash_subtitle:       '营业收入日报表',
  dash_total_rooms:    (n: number) => `共 ${n} 间客房`,
  dash_kpi_rooms:      '已入住房间',
  dash_kpi_revenue:    '营业总额 (฿)',
  dash_kpi_occupancy:  '入住率',
  dash_kpi_revpar:     'RevPAR (฿)',
  dash_daily_label:    '今日',
  dash_monthly_label:  '本月累计',
  dash_revenue_type:   '按房型收入',
  dash_col_opened:     '开房数 (今日)',
  dash_col_rev_day:    '今日营业额 (฿)',
  dash_col_rev_month:  '本月累计 (฿)',
  dash_total_row:      '合计',
  dash_occupancy:      '入住统计',
  dash_stat_opened:    '已开房数',
  dash_stat_available: '可用房间数',
  dash_stat_rate:      '净开房率',
  dash_stat_adr:       '平均房价 (ADR)',
  dash_stat_revpar:    'RevPAR',
  dash_sources:        '预订来源 (今日)',
  dash_src_direct:     '散客/直接',
  dash_payment:        '付款方式明细',
  dash_pay_total:      '小计',
  dash_balance:        '平衡',

  err_select_room:  '请选择房间',
  err_enter_guest:  '请输入客人姓名',
  err_enter_amount: '请输入金额',
  err_no_org:       '未找到组织信息',
  err_relogin:      '请重新登录',
  err_load_fail:    '加载数据失败',
  err_room_taken:   '该房间在此时段已有客人入住',
};

// ── Lookup ────────────────────────────────────────────────────────────────────

const DICTS: Record<Lang, Dict> = { th: TH, en: EN, cn: CN };

export function getDict(lang: Lang): Dict {
  return DICTS[lang];
}

// Convenience: payment method label by lang
export function getPaymentMethods(t: Dict) {
  return [
    { value: 'cash',        label: t.pay_cash },
    { value: 'qr',          label: t.pay_qr },
    { value: 'credit_card', label: t.pay_credit },
    { value: 'trip',        label: t.pay_trip },
    { value: 'agoda',       label: t.pay_agoda },
    { value: 'expedia',     label: t.pay_expedia },
    { value: 'wechat',      label: t.pay_wechat },
    { value: 'alipay',      label: t.pay_alipay },
  ];
}

export function getNationalities(t: Dict) {
  return [
    { value: 'TH',    label: t.nat_th },
    { value: 'CN',    label: t.nat_cn },
    { value: 'JP',    label: t.nat_jp },
    { value: 'KR',    label: t.nat_kr },
    { value: 'EN',    label: t.nat_en },
    { value: 'US',    label: t.nat_us },
    { value: 'OTHER', label: t.nat_other },
  ];
}

// Short payment label for tables (keeps 'Trip.com' as Trip etc.)
export function getPayLabel(method: string, t: Dict): string {
  const map: Record<string, keyof typeof TH> = {
    cash: 'pay_cash', qr: 'pay_qr', credit_card: 'pay_credit',
    trip: 'pay_trip', agoda: 'pay_agoda', expedia: 'pay_expedia',
    wechat: 'pay_wechat', alipay: 'pay_alipay',
  };
  const key = map[method];
  return key ? (t[key] as string) : method;
}

export type { Dict };
