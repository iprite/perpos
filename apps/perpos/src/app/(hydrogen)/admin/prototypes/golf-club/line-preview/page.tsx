"use client";

// line-preview/page.tsx — จำลอง LINE Booking (LIFF web form) [D1] — P4b Group C
// mobile-frame + flow 5 step: menu → grid → form → pay → done (+ queue panel)
// ⚠️ หน้านี้ + mobile-frame = UI แอปจริง → ห้าม hex (Tailwind palette เท่านั้น)
//    hex ใช้ได้เฉพาะ flex-preview.tsx (การ์ด Flex จำลอง) ที่เปิดจากปุ่ม "จำลองส่ง Flex ยืนยัน"

import { useMemo, useState, type ReactNode } from "react";
import {
  MessageCircle,
  Flag,
  Target,
  CalendarClock,
  QrCode,
  CheckCircle2,
  ChevronRight,
  Minus,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@/components/ui/dialog";
import cn from "@core/utils/class-names";
import { notify } from "@/lib/toast";
import { PageShell } from "@/components/ui/page-shell";
import {
  useGolfData,
  formatAmount,
  fmtDateTH,
  dowTH,
  addDayIso,
  TODAY_ISO,
  SLOT_STATE_META,
  BookingStatusBadge,
  PaymentStatusBadge,
} from "../_components";
import { MobileFrame, RichMenuBar } from "../_components/mobile-frame";
import { GolfFlexPreview } from "../_components/flex-preview";
import {
  liffMember,
  liffTeeSlotsTomorrow,
  liffBaysTomorrow,
} from "../_fixtures/line-mocks";
import type { GolfBooking, GolfPaymentMethod, GolfSlotOccupancy } from "../_fixtures/types";

const TOMORROW = addDayIso(TODAY_ISO, 1); // 2026-07-13
const OA_NAME = "กรีนวัลเลย์ กอล์ฟคลับ";
const BUCKET_SIZES = [30, 50, 100] as const;
type BucketSize = (typeof BUCKET_SIZES)[number];
type Step = "menu" | "grid" | "form" | "pay" | "done" | "queue";
type BookingType = "tee_time" | "driving_range";

function bayIdFromCode(code: string): string {
  const n = Number(code.replace(/[^0-9]/g, ""));
  return `res-bay-${String(n).padStart(2, "0")}`;
}
function isWeekend(iso: string): boolean {
  const d = new Date(iso).getUTCDay();
  return d === 0 || d === 6;
}
/** map liff status → SLOT_STATE_META key (reuse a11y icon/label/สี) */
const TEE_OCC: Record<"available" | "partial" | "full", GolfSlotOccupancy> = {
  available: "ว่าง",
  partial: "บางส่วน",
  full: "เต็ม",
};
const BAY_OCC: Record<"available" | "partial" | "maintenance", GolfSlotOccupancy> = {
  available: "ว่าง",
  partial: "บางส่วน",
  maintenance: "ปิดซ่อม",
};

export default function GolfLinePreviewPage() {
  const { addBooking, bookings, priceItems } = useGolfData();

  const [step, setStep] = useState<Step>("menu");
  const [bookingType, setBookingType] = useState<BookingType>("tee_time");
  const [date, setDate] = useState(TOMORROW);
  const [teeTime, setTeeTime] = useState<string | null>(null);
  const [bayCode, setBayCode] = useState<string | null>(null);
  const [party, setParty] = useState(2);
  const [caddie, setCaddie] = useState(0);
  const [cart, setCart] = useState(0);
  const [bucketSize, setBucketSize] = useState<BucketSize>(50);
  const [bucketQty, setBucketQty] = useState(1);
  const [payType, setPayType] = useState<"full" | "deposit">("deposit");
  const [method, setMethod] = useState<GolfPaymentMethod>("promptpay");
  const [lastBooking, setLastBooking] = useState<GolfBooking | null>(null);
  const [showFlex, setShowFlex] = useState(false);

  // ── auto price breakdown ──
  const quote = useMemo(() => {
    const price = (id: string, fallback: number) => priceItems.find((p) => p.id === id)?.price ?? fallback;
    const lines: { label: string; amount: number }[] = [];
    if (bookingType === "tee_time") {
      const weekend = isWeekend(date);
      const base = weekend ? price("gf-we-morning", 2500) : price("gf-wd", 1800);
      const disc = liffMember.green_fee_discount_pct;
      const unit = Math.round(base * (1 - disc / 100));
      lines.push({
        label: `กรีนฟี ${base.toLocaleString("th-TH")} − ${liffMember.tier.toUpperCase()} ${disc}% = ${unit.toLocaleString("th-TH")} × ${party}`,
        amount: unit * party,
      });
      if (caddie > 0) lines.push({ label: `แคดดี้ × ${caddie}`, amount: price("caddie-fee", 300) * caddie });
      if (cart > 0) lines.push({ label: `รถกอล์ฟ × ${cart}`, amount: price("cart-fee", 800) * cart });
    } else {
      const bid = bucketSize === 30 ? "bucket-s" : bucketSize === 50 ? "bucket-m" : "bucket-l";
      const unit = price(bid, bucketSize === 30 ? 100 : bucketSize === 50 ? 150 : 300);
      lines.push({ label: `ตะกร้า ${bucketSize} ลูก × ${bucketQty}`, amount: unit * bucketQty });
    }
    const total = lines.reduce((s, l) => s + l.amount, 0);
    return { lines, total };
  }, [bookingType, date, party, caddie, cart, bucketSize, bucketQty, priceItems]);

  const depositAmount = Math.round(quote.total * 0.3);
  const payAmount = payType === "deposit" ? depositAmount : quote.total;

  // คิวของฉัน (member gm-001 · channel line · ยังไม่จบ/ยกเลิก)
  const myQueue = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.member_id === liffMember.member_id &&
            b.channel === "line" &&
            b.status !== "cancelled" &&
            b.status !== "completed",
        )
        .sort((a, b) => `${a.booking_date}${a.start_time}`.localeCompare(`${b.booking_date}${b.start_time}`)),
    [bookings],
  );

  function resetFlow() {
    setStep("menu");
    setTeeTime(null);
    setBayCode(null);
    setParty(2);
    setCaddie(0);
    setCart(0);
    setBucketQty(1);
    setLastBooking(null);
  }

  function startBooking(type: BookingType) {
    setBookingType(type);
    setTeeTime(null);
    setBayCode(null);
    setStep("grid");
  }

  function confirmBooking(didPay: boolean) {
    const ref = `GC-${date.replace(/-/g, "")}-${String(Math.floor(Math.random() * 900) + 100)}`;
    const isTee = bookingType === "tee_time";
    const bucketId = bucketSize === 30 ? "bucket-s" : bucketSize === 50 ? "bucket-m" : "bucket-l";
    const b = addBooking({
      booking_ref: ref,
      booking_type: bookingType,
      resource_id: isTee ? "res-course-a" : bayIdFromCode(bayCode ?? "Bay 1"),
      member_id: liffMember.member_id,
      contact_name: null,
      contact_phone: null,
      booking_date: date,
      start_time: (isTee ? teeTime : "18:00") ?? "07:00",
      end_time: isTee ? null : "19:00",
      party_size: isTee ? party : 1,
      status: "pending",
      channel: "line",
      caddie_count: isTee ? caddie : null,
      cart_count: isTee ? cart : null,
      bucket_qty: isTee ? null : bucketQty,
      bucket_price_item_id: isTee ? null : bucketId,
      total_amount: quote.total,
      deposit_amount: payType === "deposit" ? depositAmount : 0,
      paid_amount: didPay ? payAmount : 0,
      payment_status: didPay ? (payType === "deposit" ? "deposit_paid" : "paid") : "unpaid",
      payment_method: didPay ? method : null,
      notes: "จองผ่าน LINE LIFF (จำลอง)",
      created_by: null,
      checked_in_at: null,
      cancelled_at: null,
      cancel_reason: null,
      items: quote.lines.map((l, i) => ({
        id: `it-${i}`,
        price_item_id: null,
        category: isTee ? "green_fee" : "range_bucket",
        description: l.label,
        qty: 1,
        unit_price: l.amount,
        line_total: l.amount,
      })),
    });
    setLastBooking(b);
    setStep("done");
    notify.success(didPay ? "จองสำเร็จ · ชำระเงินแล้ว (จำลอง)" : "จองสำเร็จ · รอชำระที่เคาน์เตอร์");
  }

  const canBack = step !== "menu";
  const onBack = () => {
    if (step === "grid" || step === "queue") setStep("menu");
    else if (step === "form") setStep("grid");
    else if (step === "pay") setStep("form");
    else if (step === "done") resetFlow();
  };

  return (
    <PageShell
      width="wide"
      title={
        <span className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6" />
          จำลอง LINE Booking (LIFF)
        </span>
      }
      description="หน้าเว็บที่ลูกค้าเห็นในแอป LINE — เลือกช่อง → จอง → ชำระเงิน (จำลอง) → รับการ์ดยืนยัน"
    >
      <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center sm:flex-row sm:justify-center">
        <Text className="text-xs font-medium text-amber-700">
          กรอบด้านล่างจำลองมือถือ — กดไล่ทั้ง flow ได้จริง (mock, ไม่ยิง LINE จริง)
        </Text>
      </div>

      <MobileFrame
        oaName={OA_NAME}
        onBack={canBack ? onBack : undefined}
        onClose={step === "done" ? resetFlow : undefined}
        footer={
          <RichMenuBar
            items={[
              { key: "tee", label: "จองสนาม", icon: <Flag className="h-5 w-5" />, active: step === "grid" && bookingType === "tee_time", onClick: () => startBooking("tee_time") },
              { key: "range", label: "จองไดร์ฟ", icon: <Target className="h-5 w-5" />, active: step === "grid" && bookingType === "driving_range", onClick: () => startBooking("driving_range") },
              { key: "queue", label: "คิวของฉัน", icon: <CalendarClock className="h-5 w-5" />, active: step === "queue", onClick: () => setStep("queue") },
            ]}
          />
        }
      >
        <div className="p-3">
          {step === "menu" && (
            <MenuView onTee={() => startBooking("tee_time")} onRange={() => startBooking("driving_range")} onQueue={() => setStep("queue")} queueCount={myQueue.length} />
          )}

          {step === "grid" && (
            <GridView
              bookingType={bookingType}
              onType={(t) => startBooking(t)}
              date={date}
              onDate={setDate}
              onPickTee={(t) => {
                setTeeTime(t);
                setStep("form");
              }}
              onPickBay={(c) => {
                setBayCode(c);
                setStep("form");
              }}
            />
          )}

          {step === "form" && (
            <FormView
              bookingType={bookingType}
              slotLabel={bookingType === "tee_time" ? `${teeTime} น.` : (bayCode ?? "")}
              date={date}
              party={party}
              setParty={setParty}
              caddie={caddie}
              setCaddie={setCaddie}
              cart={cart}
              setCart={setCart}
              bucketSize={bucketSize}
              setBucketSize={setBucketSize}
              bucketQty={bucketQty}
              setBucketQty={setBucketQty}
              quote={quote}
              onNext={() => setStep("pay")}
            />
          )}

          {step === "pay" && (
            <PayView
              payType={payType}
              setPayType={setPayType}
              method={method}
              setMethod={setMethod}
              payAmount={payAmount}
              total={quote.total}
              onPaid={() => confirmBooking(true)}
              onLater={() => confirmBooking(false)}
            />
          )}

          {step === "done" && lastBooking && (
            <DoneView booking={lastBooking} onQueue={() => setStep("queue")} onClose={resetFlow} onFlex={() => setShowFlex(true)} />
          )}

          {step === "queue" && <QueueView queue={myQueue} onBook={() => setStep("menu")} />}
        </div>
      </MobileFrame>
      </div>

      {/* จำลองส่ง Flex ยืนยัน (T3) */}
      <Dialog open={showFlex} onOpenChange={setShowFlex}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>การ์ดยืนยันที่ส่งเข้าแชท LINE (จำลอง)</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex justify-center py-2">
              <GolfFlexPreview card="t3" />
            </div>
            <Text className="mt-3 text-center text-[11px] text-gray-400">
              ภาพจำลอง LINE Flex (T3) — prototype ไม่ส่งจริง
            </Text>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ==================== Menu ====================
function MenuView({ onTee, onRange, onQueue, queueCount }: { onTee: () => void; onRange: () => void; onQueue: () => void; queueCount: number }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <Text className="text-base font-semibold text-gray-900">สวัสดีคุณ{liffMember.display_name} 👋</Text>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge tone="warning">สมาชิก {liffMember.tier.toUpperCase()}</StatusBadge>
          <Text className="text-xs text-gray-500">รับส่วนลดกรีนฟี {liffMember.green_fee_discount_pct}%</Text>
        </div>
      </div>
      <MenuCard icon={<Flag className="h-5 w-5" />} title="จองสนามกอล์ฟ" desc="เลือก tee-time 18 หลุม" onClick={onTee} />
      <MenuCard icon={<Target className="h-5 w-5" />} title="จองสนามไดร์ฟ" desc="เลือก bay + ตะกร้าลูก" onClick={onRange} />
      <MenuCard icon={<CalendarClock className="h-5 w-5" />} title="คิวของฉัน" desc={queueCount > 0 ? `มี ${queueCount} คิวที่กำลังจะถึง` : "ยังไม่มีคิว"} onClick={onQueue} />
    </div>
  );
}

function MenuCard({ icon, title, desc, onClick }: { icon: ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onClick();
        }
      }}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-primary">{icon}</span>
      <div className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-gray-900">{title}</Text>
        <Text className="text-xs text-gray-500">{desc}</Text>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
    </div>
  );
}

// ==================== Grid ====================
function GridView({
  bookingType,
  onType,
  date,
  onDate,
  onPickTee,
  onPickBay,
}: {
  bookingType: BookingType;
  onType: (t: BookingType) => void;
  date: string;
  onDate: (iso: string) => void;
  onPickTee: (t: string) => void;
  onPickBay: (c: string) => void;
}) {
  return (
    <div className="space-y-3">
      <SegmentedControl
        value={bookingType}
        onChange={onType}
        fullWidth
        options={[
          { value: "tee_time", label: "สนามกอล์ฟ", icon: <Flag className="h-4 w-4" /> },
          { value: "driving_range", label: "สนามไดร์ฟ", icon: <Target className="h-4 w-4" /> },
        ]}
      />
      <div>
        <Text className="mb-1 text-xs font-medium text-gray-500">วันที่ต้องการเล่น</Text>
        <ThaiDatePicker value={date} onChange={(iso) => onDate(iso || TOMORROW)} />
        <Text className="mt-1 text-[11px] text-gray-400">
          {dowTH(date)} {fmtDateTH(date)}
        </Text>
      </div>

      {bookingType === "tee_time" ? (
        <div className="space-y-2">
          {liffTeeSlotsTomorrow.map((s) => {
            const occ = TEE_OCC[s.status];
            const meta = SLOT_STATE_META[occ];
            const disabled = s.status === "full";
            const sub =
              s.status === "available" ? "ว่าง 4 ที่" : s.status === "partial" ? `เหลือ ${s.remaining} ที่` : "เต็ม";
            return (
              <SlotCard
                key={s.time}
                title={`${s.time} น.`}
                sub={sub}
                icon={meta.icon}
                cellClass={meta.cell}
                disabled={disabled}
                onClick={() => onPickTee(s.time)}
              />
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {liffBaysTomorrow.map((b) => {
            const occ = BAY_OCC[b.status];
            const meta = SLOT_STATE_META[occ];
            const disabled = b.status === "maintenance";
            const sub = b.status === "maintenance" ? "ปิดซ่อม" : b.status === "partial" ? "ว่างบางช่วง" : "ว่าง";
            return (
              <SlotCard
                key={b.code}
                title={b.code}
                sub={sub}
                icon={meta.icon}
                cellClass={meta.cell}
                disabled={disabled}
                onClick={() => onPickBay(b.code)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SlotCard({
  title,
  sub,
  icon,
  cellClass,
  disabled,
  onClick,
}: {
  title: string;
  sub: string;
  icon: ReactNode;
  cellClass: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const activate = () => {
    if (!disabled) onClick();
  };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={activate}
      onKeyDown={(ev) => {
        if (!disabled && (ev.key === "Enter" || ev.key === " ")) {
          ev.preventDefault();
          activate();
        }
      }}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
        cellClass,
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:brightness-[0.98]",
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium tabular-nums">{title}</span>
      </div>
      <span className="text-[11px]">{sub}</span>
    </div>
  );
}

// ==================== Form ====================
function FormView({
  bookingType,
  slotLabel,
  date,
  party,
  setParty,
  caddie,
  setCaddie,
  cart,
  setCart,
  bucketSize,
  setBucketSize,
  bucketQty,
  setBucketQty,
  quote,
  onNext,
}: {
  bookingType: BookingType;
  slotLabel: string;
  date: string;
  party: number;
  setParty: (n: number) => void;
  caddie: number;
  setCaddie: (n: number) => void;
  cart: number;
  setCart: (n: number) => void;
  bucketSize: BucketSize;
  setBucketSize: (n: BucketSize) => void;
  bucketQty: number;
  setBucketQty: (n: number) => void;
  quote: { lines: { label: string; amount: number }[]; total: number };
  onNext: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <Text className="text-xs text-gray-500">{bookingType === "tee_time" ? "สนาม A (18 หลุม)" : "สนามไดร์ฟ"}</Text>
        <Text className="text-sm font-semibold text-gray-900">
          {dowTH(date)} {fmtDateTH(date)} · {slotLabel}
        </Text>
      </div>

      {bookingType === "tee_time" ? (
        <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3">
          <Stepper label="ผู้เล่น" value={party} min={1} max={4} onChange={setParty} />
          <Stepper label="แคดดี้" value={caddie} min={0} max={4} onChange={setCaddie} />
          <Stepper label="รถกอล์ฟ" value={cart} min={0} max={2} onChange={setCart} />
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3">
          <div>
            <Text className="mb-1.5 text-xs font-medium text-gray-500">ขนาดตะกร้า</Text>
            <SegmentedControl
              value={String(bucketSize)}
              onChange={(v) => setBucketSize(Number(v) as BucketSize)}
              fullWidth
              size="sm"
              options={BUCKET_SIZES.map((s) => ({ value: String(s), label: `${s} ลูก` }))}
            />
          </div>
          <Stepper label="จำนวนตะกร้า" value={bucketQty} min={1} max={10} onChange={setBucketQty} />
        </div>
      )}

      {/* auto price breakdown */}
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <Text className="mb-2 text-xs font-medium text-gray-500">สรุปค่าบริการ (สมาชิกได้ราคาพิเศษ)</Text>
        <div className="space-y-1.5">
          {quote.lines.map((l, i) => (
            <div key={i} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-gray-600">{l.label}</span>
              <span className="shrink-0 text-right tabular-nums text-gray-700">{formatAmount(l.amount)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-gray-100 pt-2">
            <Text className="text-sm font-semibold text-gray-900">รวม</Text>
            <Text className="text-sm font-semibold tabular-nums text-gray-900">{formatAmount(quote.total)}</Text>
          </div>
        </div>
      </div>

      <Button className="w-full" onClick={onNext}>
        ถัดไป — ชำระเงิน
        <ChevronRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Text className="text-sm text-gray-700">{label}</Text>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="outline" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`ลด${label}`}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums text-gray-900">{value}</span>
        <Button size="icon" variant="outline" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`เพิ่ม${label}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ==================== Pay ====================
function PayView({
  payType,
  setPayType,
  method,
  setMethod,
  payAmount,
  total,
  onPaid,
  onLater,
}: {
  payType: "full" | "deposit";
  setPayType: (v: "full" | "deposit") => void;
  method: GolfPaymentMethod;
  setMethod: (m: GolfPaymentMethod) => void;
  payAmount: number;
  total: number;
  onPaid: () => void;
  onLater: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Text className="mb-1.5 text-xs font-medium text-gray-500">ยอดชำระ</Text>
        <SegmentedControl
          value={payType}
          onChange={setPayType}
          fullWidth
          options={[
            { value: "deposit", label: "มัดจำ 30%" },
            { value: "full", label: "จ่ายเต็ม" },
          ]}
        />
      </div>
      <div>
        <Text className="mb-1.5 text-xs font-medium text-gray-500">วิธีชำระ</Text>
        <SegmentedControl
          value={method}
          onChange={setMethod}
          fullWidth
          size="sm"
          options={[
            { value: "promptpay", label: "พร้อมเพย์" },
            { value: "card", label: "บัตร" },
            { value: "cash", label: "เงินสด" },
          ]}
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
        {method === "promptpay" ? (
          <>
            <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
              <QrCode className="h-24 w-24 text-gray-400" />
            </div>
            <Text className="mt-2 text-xs text-gray-500">สแกนพร้อมเพย์เพื่อชำระ (QR จำลอง)</Text>
          </>
        ) : (
          <div className="py-6">
            <Text className="text-sm text-gray-600">
              {method === "card" ? "ชำระด้วยบัตรเครดิต/เดบิต (จำลอง)" : "ชำระเงินสดที่เคาน์เตอร์"}
            </Text>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <Text className="text-sm text-gray-500">ยอดที่ต้องชำระ{payType === "deposit" ? " (มัดจำ)" : ""}</Text>
          <Text className="text-base font-semibold tabular-nums text-gray-900">{formatAmount(payAmount)}</Text>
        </div>
        {payType === "deposit" && (
          <Text className="mt-1 text-right text-[11px] text-gray-400">
            ยอดเต็ม {formatAmount(total)} · คงเหลือชำระที่เคาน์เตอร์
          </Text>
        )}
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-700">
        โหมดจำลอง — ไม่มีการตัดเงินจริง
      </div>

      <Button className="w-full" onClick={onPaid}>
        <CheckCircle2 className="mr-1.5 h-4 w-4" />
        ฉันชำระแล้ว (จำลอง)
      </Button>
      <Button className="w-full" variant="outline" onClick={onLater}>
        ไม่ชำระตอนนี้ / จ่ายทีหลัง
      </Button>
    </div>
  );
}

// ==================== Done ====================
function DoneView({ booking, onQueue, onClose, onFlex }: { booking: GolfBooking; onQueue: () => void; onClose: () => void; onFlex: () => void }) {
  const isTee = booking.booking_type === "tee_time";
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <Text className="text-base font-semibold text-gray-900">จองสำเร็จ</Text>
        <Text className="text-xs text-gray-500">เลขที่ {booking.booking_ref}</Text>
      </div>

      <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-sm">
        <Row label="สนาม" value={isTee ? "สนาม A (18 หลุม)" : "สนามไดร์ฟ"} />
        <Row label="วันที่" value={`${dowTH(booking.booking_date)} ${fmtDateTH(booking.booking_date)}`} />
        <Row label="เวลา" value={`${booking.start_time} น.`} />
        <Row label={isTee ? "ผู้เล่น" : "ตะกร้า"} value={isTee ? `${booking.party_size} คน` : `${booking.bucket_qty} ตะกร้า`} />
        <div className="flex items-center justify-between border-t border-gray-100 pt-2">
          <Text className="text-sm text-gray-500">ค่าบริการ</Text>
          <Text className="text-sm font-semibold tabular-nums text-gray-900">{formatAmount(booking.total_amount ?? 0)}</Text>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <BookingStatusBadge status={booking.status} />
            <PaymentStatusBadge status={booking.payment_status} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        <MessageCircle className="h-4 w-4 shrink-0 text-gray-400" />
        เราจะส่งการ์ดยืนยันเข้าแชท LINE ของคุณ
      </div>

      <Button className="w-full" variant="outline" onClick={onFlex}>
        <Sparkles className="mr-1.5 h-4 w-4" />
        จำลองส่ง Flex ยืนยัน
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onQueue}>
          ดูคิวของฉัน
        </Button>
        <Button onClick={onClose}>ปิด</Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm text-gray-900">{value}</Text>
    </div>
  );
}

// ==================== Queue ====================
function QueueView({ queue, onBook }: { queue: GolfBooking[]; onBook: () => void }) {
  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 rounded-full bg-gray-100 p-4">
          <CalendarClock className="h-7 w-7 text-gray-400" />
        </div>
        <Text className="text-sm font-medium text-gray-900">ยังไม่มีคิวที่กำลังจะถึง</Text>
        <Text className="mt-1 text-xs text-gray-500">แตะปุ่มด้านล่างเพื่อจองเลย</Text>
        <Button className="mt-3" size="sm" onClick={onBook}>
          จองสนาม/ไดร์ฟ
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Text className="px-1 text-xs font-medium text-gray-500">คิวของฉัน ({queue.length})</Text>
      {queue.map((b) => (
        <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <Text className="text-sm font-semibold text-gray-900">{b.booking_ref}</Text>
            <BookingStatusBadge status={b.status} />
          </div>
          <Text className="mt-0.5 text-xs text-gray-500">
            {b.booking_type === "tee_time" ? "สนามกอล์ฟ" : "สนามไดร์ฟ"} · {dowTH(b.booking_date)} {fmtDateTH(b.booking_date)} · {b.start_time} น.
          </Text>
          <div className="mt-1.5 flex items-center gap-1.5">
            <PaymentStatusBadge status={b.payment_status} />
            <span className="text-xs tabular-nums text-gray-500">{formatAmount(b.total_amount ?? 0)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
