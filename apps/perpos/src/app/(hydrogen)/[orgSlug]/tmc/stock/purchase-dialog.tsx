'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import { NativeSelect } from '@/components/ui/native-select';
import { ThaiDatePicker } from '@/components/ui/thai-date-picker';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, Upload, Loader2, Camera, Pencil } from 'lucide-react';

const TMC_ORG_ID = '1f52618c-09c4-49c5-a929-ea5060f26e7d';

// ── Types ─────────────────────────────────────────────────────────────────────
type LineItem = {
  id: string;           // local key only
  name: string;
  unit: string;
  qty: string;
  unitCost: string;
};

type StockItem = { id: string; name: string; unit: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  authHeader: () => Promise<Record<string, string>>;
  stockItems: StockItem[];
  unitOptions: { value: string; label: string }[];
  categoryOptions: { value: string; label: string }[];
  accountOptions: { value: string; label: string }[];
};

const PROPERTY_OPTIONS = [
  { value: '', label: '— ส่วนกลาง (ไม่ระบุ) —' },
  { value: 'TMC1', label: 'TMC1' }, { value: 'TMC2', label: 'TMC2' },
  { value: 'TMC3-4', label: 'TMC3-4' }, { value: 'TMC5', label: 'TMC5' },
  { value: 'TMC6', label: 'TMC6' }, { value: 'TMC7', label: 'TMC7' },
  { value: 'ส่วนกลาง', label: 'ส่วนกลาง' },
];

function uid() { return Math.random().toString(36).slice(2); }

function newLine(unit = 'ชิ้น'): LineItem {
  return { id: uid(), name: '', unit, qty: '', unitCost: '' };
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** บีบอัดรูปก่อนส่ง API: ย่อขนาดสูงสุด 1920px และไม่เกิน 2MB */
async function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  const MAX_PX    = 1920;
  const MAX_BYTES = 2 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const img    = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const scale  = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

      // ลด quality ทีละขั้น จนขนาดไม่เกิน 2MB
      let quality = 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.4) {
        quality -= 0.1;
        dataUrl  = canvas.toDataURL('image/jpeg', quality);
      }
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = objUrl;
  });
}

// ── PurchaseDialog ────────────────────────────────────────────────────────────
export function PurchaseDialog({
  open, onClose, onSaved, authHeader, stockItems, unitOptions, categoryOptions, accountOptions,
}: Props) {
  const [mode, setMode] = useState<'manual' | 'ocr'>('manual');
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  // finance fields
  const today = new Date().toISOString().slice(0, 10);
  const [finDate,     setFinDate]     = useState(today);
  const [accountId,   setAccountId]   = useState(accountOptions[0]?.value ?? '');
  const [category,    setCategory]    = useState('แมคโค');
  const [propertyCode,setPropertyCode]= useState('ส่วนกลาง');
  const [finNote,     setFinNote]     = useState('');

  // ocr state
  const [ocrLoading,  setOcrLoading]  = useState(false);
  const [ocrError,    setOcrError]    = useState('');
  const [previewUrl,  setPreviewUrl]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // datalist id for name suggestions
  const listId = 'purchase-stock-names';

  // ── Line helpers ─────────────────────────────────────────────────────────────
  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  }

  function autoFillUnit(id: string, name: string) {
    const existing = stockItems.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (existing) updateLine(id, { name: existing.name, unit: existing.unit });
    else           updateLine(id, { name });
  }

  function addLine() { setLines(ls => [...ls, newLine()]); }

  function removeLine(id: string) {
    setLines(ls => ls.length > 1 ? ls.filter(l => l.id !== id) : ls);
  }

  // ── OCR ─────────────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setOcrError('');
    setPreviewUrl(URL.createObjectURL(file));
    setOcrLoading(true);

    try {
      // บีบอัดรูปก่อนส่ง (max 1920px / 2MB)
      const { base64, mimeType } = await compressImage(file);

      const h = await authHeader();
      const res = await fetch('/api/tmc/stock/ocr', {
        method: 'POST', headers: h,
        body: JSON.stringify({ orgId: TMC_ORG_ID, imageBase64: base64, mimeType }),
      });
      const data = await res.json() as {
        items?: LineItem[];
        note?: string | null;
        date?: string | null;
        expense_category?: string | null;
        error?: string;
      };

      setOcrLoading(false);
      if (!res.ok || data.error) {
        setOcrError((data.error ?? 'ไม่สามารถอ่านบิลได้') + ' — ลองสลับเป็นโหมดกรอกเองได้เลย');
        return;
      }

      // Auto-fill fields จาก OCR
      if (data.note)             setFinNote(data.note);
      if (data.date)             setFinDate(data.date);
      if (data.expense_category) setCategory(data.expense_category);

      const parsed = (data.items ?? []).map(i => ({
        id:       uid(),
        name:     String(i.name     ?? ''),
        unit:     String(i.unit     || 'ชิ้น'),
        qty:      String(i.qty      ?? ''),
        unitCost: String(i.unitCost ?? ''),
      }));
      if (parsed.length > 0) setLines(parsed);

    } catch {
      setOcrLoading(false);
      setOcrError('เกิดข้อผิดพลาดในการอ่านบิล — กรุณาสลับเป็นโหมดกรอกเอง');
    }
  }, [authHeader]);

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    const valid = lines.filter(l => l.name.trim() && Number(l.qty) > 0 && Number(l.unitCost) >= 0);
    if (valid.length === 0) { setError('กรุณากรอกรายการสินค้าอย่างน้อย 1 รายการ'); return; }
    if (!accountId) { setError('กรุณาเลือกบัญชี'); return; }

    setSaving(true); setError('');
    const h = await authHeader();
    const res = await fetch('/api/tmc/stock/purchase', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        orgId: TMC_ORG_ID,
        date: finDate,
        accountId,
        category,
        propertyCode,
        note: finNote || null,
        items: valid.map(l => ({
          name:     l.name.trim(),
          unit:     l.unit || 'ชิ้น',
          qty:      Number(l.qty),
          unitCost: Number(l.unitCost),
        })),
      }),
    });

    const data = await res.json() as { error?: string };
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'เกิดข้อผิดพลาด'); return; }

    // reset
    setLines([newLine()]);
    setFinDate(today); setFinNote(''); setOcrError(''); setPreviewUrl('');
    setMode('manual');
    onSaved();
  }

  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>ซื้อสินค้าเข้าคลัง</DialogTitle>
        </DialogHeader>

        <DialogBody>
        {/* Mode toggle */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {(['manual', 'ocr'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                ${mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {m === 'manual' ? <><Pencil className="w-3.5 h-3.5" /> กรอกเอง</> : <><Camera className="w-3.5 h-3.5" /> อ่านบิล OCR</>}
            </button>
          ))}
        </div>

        {/* OCR upload area */}
        {mode === 'ocr' && (
          <div className="space-y-3">
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
            >
              {previewUrl
                ? <img src={previewUrl} alt="bill preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-500">คลิกหรือลากไฟล์รูปบิล/ใบเสร็จมาวาง</p>
                    <p className="text-xs text-slate-400">รองรับ JPG, PNG, HEIC</p>
                  </div>
                )}
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
              />
            </div>

            {ocrLoading && (
              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 rounded-lg px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังบีบอัดรูปและส่ง Gemini อ่านบิล…
              </div>
            )}
            {ocrError && (
              <div className="space-y-1.5">
                <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{ocrError}</div>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className="text-xs text-blue-600 underline hover:text-blue-800"
                >
                  → สลับเป็นโหมดกรอกเอง
                </button>
              </div>
            )}
            {!ocrLoading && !ocrError && lines.some(l => l.name) && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5">
                <span className="text-green-600 text-sm font-medium">✓ อ่านบิลสำเร็จ</span>
                <span className="text-xs text-slate-500">— ตรวจสอบรายการและหมวดหมู่ด้านล่างก่อนบันทึก</span>
              </div>
            )}
          </div>
        )}

        {/* Line items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">รายการสินค้า</p>
            <Button variant="ghost" size="sm" onClick={addLine} className="text-blue-600 h-7">
              <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มรายการ
            </Button>
          </div>

          {/* Datalist for name autocomplete */}
          <datalist id={listId}>
            {stockItems.map(s => <option key={s.id} value={s.name} />)}
          </datalist>

          {/* Header row */}
          <div className="grid grid-cols-[1fr_80px_90px_90px_32px] gap-2 px-1">
            <p className="text-xs text-slate-400 font-medium">สินค้า</p>
            <p className="text-xs text-slate-400 font-medium">หน่วย</p>
            <p className="text-xs text-slate-400 font-medium">จำนวน</p>
            <p className="text-xs text-slate-400 font-medium">ราคา/หน่วย</p>
            <span />
          </div>

          {lines.map(l => {
            const lineTotal = (Number(l.qty) || 0) * (Number(l.unitCost) || 0);
            return (
              <div key={l.id} className="grid grid-cols-[1fr_80px_90px_90px_32px] gap-2 items-center">
                <Input
                  value={l.name}
                  onChange={e => autoFillUnit(l.id, e.target.value)}
                  list={listId}
                  placeholder="ชื่อสินค้า"
                  className="h-8 text-sm"
                />
                <NativeSelect
                  value={l.unit}
                  onChange={e => updateLine(l.id, { unit: e.target.value })}
                  className="h-8 text-sm"
                >
                  {unitOptions.filter(u => u.value).map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </NativeSelect>
                <Input
                  type="number" min="0" step="any"
                  value={l.qty}
                  onChange={e => updateLine(l.id, { qty: e.target.value })}
                  placeholder="0"
                  className="h-8 text-sm text-right"
                />
                <Input
                  type="number" min="0" step="any"
                  value={l.unitCost}
                  onChange={e => updateLine(l.id, { unitCost: e.target.value })}
                  placeholder="0.00"
                  className="h-8 text-sm text-right"
                />
                <div className="flex items-center justify-end gap-1">
                  {lineTotal > 0 && (
                    <span className="text-xs text-slate-400 w-16 text-right hidden sm:block">
                      {fmt(lineTotal)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeLine(l.id)}
                    className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Total */}
          <div className="flex justify-end pt-1 border-t">
            <div className="text-right">
              <p className="text-xs text-slate-400">ยอดรวม</p>
              <p className="text-xl font-bold text-slate-900">฿{fmt(total)}</p>
            </div>
          </div>
        </div>

        {/* Finance info */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">บันทึกบัญชี</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pur-date">วันที่</Label>
              <ThaiDatePicker value={finDate} onChange={setFinDate} placeholder="เลือกวันที่" />
            </div>
            <div className="space-y-1.5">
              <Label>บัญชี *</Label>
              <CustomSelect value={accountId} onChange={setAccountId} options={accountOptions} />
            </div>
            <div className="space-y-1.5">
              <Label>หมวดหมู่</Label>
              <CustomSelect value={category} onChange={setCategory} options={categoryOptions} />
            </div>
            <div className="space-y-1.5">
              <Label>แปลง</Label>
              <CustomSelect value={propertyCode} onChange={setPropertyCode} options={PROPERTY_OPTIONS} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pur-note">หมายเหตุ</Label>
            <Input id="pur-note" value={finNote} onChange={e => setFinNote(e.target.value)} placeholder="เช่น แมคโค สาขาเชียงราย" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={() => void handleSave()} disabled={saving || total === 0}>
            {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />กำลังบันทึก…</> : `บันทึก ฿${fmt(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
