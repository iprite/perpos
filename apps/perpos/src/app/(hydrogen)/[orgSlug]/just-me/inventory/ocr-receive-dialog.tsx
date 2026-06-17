'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, Upload, Loader2, Camera, Pencil } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────
type LineItem = { id: string; name: string; unit: string; qty: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  orgId: string;
  authToken: string;
  existingItemNames: string[];
  warehouseOptions: { value: string; label: string }[];
};

const UNIT_OPTIONS = ['ชิ้น', 'เมตร', 'ม้วน', 'กล่อง', 'ลัง', 'แพ็ค', 'ถุง', 'กก', 'ลิตร', 'โหล', 'ชุด', 'เครื่อง'];

function uid() { return Math.random().toString(36).slice(2); }
function newLine(): LineItem { return { id: uid(), name: '', unit: 'ชิ้น', qty: '' }; }

/** บีบอัดรูปก่อนส่ง: สูงสุด 1920px / 2MB */
async function compressImage(file: File): Promise<{ base64: string; mimeType: string }> {
  const MAX_PX = 1920;
  const MAX_BYTES = 2 * 1024 * 1024;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);

      let quality = 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.4) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = objUrl;
  });
}

// ── OcrReceiveDialog ──────────────────────────────────────────────────────────
export function OcrReceiveDialog({
  open, onClose, onSaved, orgId, authToken, existingItemNames, warehouseOptions,
}: Props) {
  const [mode, setMode] = useState<'manual' | 'ocr'>('manual');
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  const today = new Date().toISOString().slice(0, 10);
  const [warehouseId, setWarehouseId] = useState(warehouseOptions[0]?.value ?? '');
  const [referenceNo, setReferenceNo] = useState('');
  const [note, setNote] = useState('');

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const listId = 'ocr-item-names';

  // ── Line helpers ──────────────────────────────────────────────────────────────
  function updateLine(id: string, patch: Partial<LineItem>) {
    setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  }
  function addLine() { setLines(ls => [...ls, newLine()]); }
  function removeLine(id: string) {
    setLines(ls => ls.length > 1 ? ls.filter(l => l.id !== id) : ls);
  }

  // ── OCR ──────────────────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setOcrError('');
    setPreviewUrl(URL.createObjectURL(file));
    setOcrLoading(true);

    try {
      const { base64, mimeType } = await compressImage(file);

      const res = await fetch(`/api/just-me/inventory/ocr?orgId=${orgId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ orgId, imageBase64: base64, mimeType }),
      });

      const data = await res.json() as {
        items?: { name: string; unit: string; qty: number }[];
        note?: string | null;
        date?: string | null;
        error?: string;
      };

      setOcrLoading(false);

      if (!res.ok || data.error) {
        setOcrError((data.error ?? 'ไม่สามารถอ่านบิลได้') + ' — ลองสลับเป็นโหมดกรอกเองได้เลย');
        return;
      }

      if (data.note) setNote(data.note);

      const parsed = (data.items ?? []).map(i => ({
        id: uid(),
        name: String(i.name ?? ''),
        unit: String(i.unit || 'ชิ้น'),
        qty: String(i.qty ?? ''),
      }));
      if (parsed.length > 0) setLines(parsed);

    } catch {
      setOcrLoading(false);
      setOcrError('เกิดข้อผิดพลาดในการอ่านบิล — กรุณาสลับเป็นโหมดกรอกเอง');
    }
  }, [orgId, authToken]);

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    const valid = lines.filter(l => l.name.trim() && Number(l.qty) > 0);
    if (valid.length === 0) { setError('กรุณากรอกรายการสินค้าอย่างน้อย 1 รายการ'); return; }
    if (!warehouseId) { setError('กรุณาเลือกคลังปลายทาง'); return; }

    setSaving(true); setError('');

    const res = await fetch(`/api/just-me/inventory/batch-receive?orgId=${orgId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        warehouseId,
        referenceNo: referenceNo || undefined,
        note: note || undefined,
        items: valid.map(l => ({ name: l.name.trim(), unit: l.unit || 'ชิ้น', qty: Number(l.qty) })),
      }),
    });

    const data = await res.json() as {
      results?: { name: string; created: boolean }[];
      errors?: string[];
      error?: string;
    };

    setSaving(false);

    if (!res.ok && data.error) { setError(data.error); return; }

    if (data.errors && data.errors.length > 0) {
      setError(`บันทึกบางรายการไม่สำเร็จ: ${data.errors.join(', ')}`);
    }

    // reset
    setLines([newLine()]);
    setReferenceNo(''); setNote(''); setOcrError(''); setPreviewUrl('');
    setMode('manual');
    onSaved();
  }

  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>เพิ่มของลงคลัง — สแกนบิล / กรอกเอง</DialogTitle>
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
              {m === 'manual'
                ? <><Pencil className="w-3.5 h-3.5" /> กรอกเอง</>
                : <><Camera className="w-3.5 h-3.5" /> อ่านบิล OCR</>}
            </button>
          ))}
        </div>

        {/* OCR upload area */}
        {mode === 'ocr' && (
          <div className="space-y-3">
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFile(f); }}
            >
              {previewUrl
                ? <img src={previewUrl} alt="bill preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm text-slate-500">คลิกหรือลากไฟล์รูปบิล/ใบส่งของมาวาง</p>
                    <p className="text-xs text-slate-400">รองรับ JPG, PNG, HEIC</p>
                  </div>
                )}
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
              />
            </div>

            {ocrLoading && (
              <div className="flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 rounded-lg px-4 py-3">
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
                  className="text-xs text-indigo-600 underline hover:text-indigo-800"
                >
                  → สลับเป็นโหมดกรอกเอง
                </button>
              </div>
            )}
            {!ocrLoading && !ocrError && lines.some(l => l.name) && (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5">
                <span className="text-green-600 text-sm font-medium">✓ อ่านบิลสำเร็จ</span>
                <span className="text-xs text-slate-500">— ตรวจสอบรายการด้านล่างก่อนบันทึก</span>
              </div>
            )}
          </div>
        )}

        {/* Line items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">รายการสินค้า / วัสดุ</p>
            <Button variant="ghost" size="sm" onClick={addLine} className="text-indigo-600 h-7">
              <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มรายการ
            </Button>
          </div>

          {/* Datalist for autocomplete from existing items */}
          <datalist id={listId}>
            {existingItemNames.map(n => <option key={n} value={n} />)}
          </datalist>

          {/* Header */}
          <div className="grid grid-cols-[1fr_90px_80px_32px] gap-2 px-1">
            <p className="text-xs text-slate-400 font-medium">ชื่อสินค้า / วัสดุ</p>
            <p className="text-xs text-slate-400 font-medium">หน่วย</p>
            <p className="text-xs text-slate-400 font-medium">จำนวน</p>
            <span />
          </div>

          {lines.map(l => (
            <div key={l.id} className="grid grid-cols-[1fr_90px_80px_32px] gap-2 items-center">
              <Input
                value={l.name}
                onChange={e => updateLine(l.id, { name: e.target.value })}
                list={listId}
                placeholder="ชื่อสินค้า / วัสดุ"
                className="h-8 text-sm"
              />
              <CustomSelect
                value={l.unit}
                onChange={v => updateLine(l.id, { unit: v })}
                options={UNIT_OPTIONS.map(u => ({ value: u, label: u }))}
              />
              <Input
                type="number" min="0" step="any"
                value={l.qty}
                onChange={e => updateLine(l.id, { qty: e.target.value })}
                placeholder="0"
                className="h-8 text-sm text-right"
              />
              <button
                type="button"
                onClick={() => removeLine(l.id)}
                className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="flex justify-end pt-1 border-t">
            <p className="text-xs text-slate-400">รวม <span className="font-bold text-slate-700">{totalQty}</span> ชิ้น/หน่วย</p>
          </div>
        </div>

        {/* Receive info */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">ข้อมูลการรับเข้าคลัง</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>คลังปลายทาง *</Label>
              <CustomSelect
                value={warehouseId}
                onChange={setWarehouseId}
                options={warehouseOptions}
                placeholder="— เลือกคลังสินค้า —"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ocr-ref">เลขที่เอกสารอ้างอิง</Label>
              <Input
                id="ocr-ref"
                value={referenceNo}
                onChange={e => setReferenceNo(e.target.value)}
                placeholder="เช่น PO-2026-001 หรือ เลขบิล"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ocr-note">หมายเหตุ / ชื่อร้าน</Label>
              <Input
                id="ocr-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="เช่น แมคโครสาขาเชียงราย"
              />
            </div>
          </div>
        </div>

        {/* New item notice */}
        {lines.some(l => l.name && !existingItemNames.some(n => n.toLowerCase() === l.name.toLowerCase())) && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
            <span className="font-semibold">⚠ สินค้าใหม่:</span> รายการที่ไม่มีในระบบจะถูกสร้างอัตโนมัติ (รหัส AUTO-…) คุณสามารถแก้ไขรหัสและรายละเอียดเพิ่มเติมได้ภายหลังในแท็บ &quot;ข้อมูลวัสดุ/สินค้า&quot;
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={() => void handleSave()} disabled={saving || totalQty === 0}>
            {saving
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />กำลังบันทึก…</>
              : `บันทึกรับเข้าคลัง (${lines.filter(l => l.name && Number(l.qty) > 0).length} รายการ)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
