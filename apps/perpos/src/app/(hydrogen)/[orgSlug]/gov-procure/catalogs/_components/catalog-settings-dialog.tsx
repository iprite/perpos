"use client";

// catalog-settings-dialog.tsx — ตั้งค่าชุด (PUT /api/gov-procure/catalogs/[id])
// รวม "แนบเข้างาน" + "อนุมัติชุด" + "ลบชุด" ไว้ที่เดียว (ลดจำนวน dialog ที่ผู้ใช้ต้องจำ)
// C-6 — เปลี่ยนบริษัท = หัวจดหมายของชุดถูกดึงใหม่จากค่าตั้งต้นของบริษัทใหม่ → ต้องเตือนก่อน

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomSelect } from "@/components/ui/custom-select";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/typography";
import { ImageUpload } from "@/components/ui/image-upload";
import { toast } from "@/lib/toast";
import type { Catalog, CatalogTemplate, Letterhead } from "@/lib/gov-procure/catalog";
import { COMPANIES, type GovProcureOrder } from "@/lib/gov-procure/types";
import { govApi } from "../../_components/api";
import { TEMPLATE_HINT, validateLogoDataUrl } from "./format";

/** ฟอร์มหัวจดหมายของ "ชุดนี้" (snapshot) — ชื่อฟิลด์ตรงกับ `letterhead_snapshot` ของ PUT /catalogs/[id] */
interface LetterheadForm {
  company_name: string;
  /** หลายบรรทัด — แปลงเป็น `address_lines: string[]` ตอนส่ง (server ตัดเหลือ 6 บรรทัด) */
  address: string;
  phone: string;
  tax_id: string;
  logo_data_url: string | null;
}

const EMPTY_LETTERHEAD: LetterheadForm = {
  company_name: "",
  address: "",
  phone: "",
  tax_id: "",
  logo_data_url: null,
};

export function CatalogSettingsDialog({
  open,
  onOpenChange,
  catalog,
  orders,
  orgId,
  orgSlug,
  canWrite,
  canDelete,
  verifiedAll,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Catalog;
  orders: GovProcureOrder[];
  orgId: string;
  orgSlug: string;
  canWrite: boolean;
  canDelete: boolean;
  /** ตรวจครบทุกรายการแล้วหรือยัง (ใช้เตือนตอนกดอนุมัติ) */
  verifiedAll: boolean;
  onSaved: (catalog: Catalog) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(catalog.title);
  const [company, setCompany] = useState(catalog.company ?? "");
  const [template, setTemplate] = useState<CatalogTemplate>(catalog.template);
  const [showPrices, setShowPrices] = useState(catalog.show_prices);
  const [orderId, setOrderId] = useState(catalog.order_id ?? "");
  const [notes, setNotes] = useState(catalog.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [letterhead, setLetterhead] = useState<LetterheadForm>(EMPTY_LETTERHEAD);
  const [loadingDefault, setLoadingDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(catalog.title);
    setCompany(catalog.company ?? "");
    setTemplate(catalog.template);
    setShowPrices(catalog.show_prices);
    setOrderId(catalog.order_id ?? "");
    setNotes(catalog.notes ?? "");
    setConfirmDelete(false);
    const snap = catalog.letterhead_snapshot;
    setLetterhead(
      snap
        ? {
            company_name: snap.company_name ?? "",
            address: (snap.address_lines ?? []).join("\n"),
            phone: snap.phone ?? "",
            tax_id: snap.tax_id ?? "",
            logo_data_url: snap.logo_data_url ?? null,
          }
        : EMPTY_LETTERHEAD,
    );
  }, [open, catalog]);

  const companyChanged = (catalog.company ?? "") !== company;
  const locked = catalog.status === "enriching";
  /** หัวจดหมายพิมพ์เฉพาะเทมเพลตบรรยาย (ตารางไม่มีหัวจดหมาย) */
  const showLetterhead = template === "narrative";

  function setLh(key: keyof LetterheadForm, value: string) {
    setLetterhead((f) => ({ ...f, [key]: value }));
  }

  /** โลโก้จาก ImageUpload = data URL → ตรวจชนิด/ขนาดก่อน ไม่ปล่อยให้ server ตอบ error ดิบ */
  function changeLogo(dataUrl: string | null) {
    if (!dataUrl) {
      setLetterhead((f) => ({ ...f, logo_data_url: null }));
      return;
    }
    const error = validateLogoDataUrl(dataUrl);
    if (error) {
      toast.error(error);
      return;
    }
    setLetterhead((f) => ({ ...f, logo_data_url: dataUrl }));
  }

  /** ดึงค่าตั้งต้นของบริษัทมาเติมในฟอร์ม (ยังไม่บันทึก — ผู้ใช้กดบันทึกเอง) */
  async function loadCompanyDefault() {
    if (!company) {
      toast.error("เลือกบริษัทของชุดนี้ก่อน");
      return;
    }
    setLoadingDefault(true);
    try {
      const res = await govApi<{ letterheads: Letterhead[] }>(
        `/api/gov-procure/catalog-letterheads?orgId=${encodeURIComponent(orgId)}&company=${encodeURIComponent(company)}`,
        "GET",
      );
      const found = (res.letterheads ?? [])[0];
      if (!found) {
        toast("ยังไม่ได้ตั้งค่าหัวจดหมายของบริษัทนี้ — กรอกในช่องด้านล่างได้เลย");
        return;
      }
      setLetterhead({
        company_name: found.company_name ?? "",
        address: (found.address_lines ?? []).join("\n"),
        phone: found.phone ?? "",
        tax_id: found.tax_id ?? "",
        logo_data_url: found.logo_data_url ?? null,
      });
      toast.success("เติมค่าตั้งต้นของบริษัทลงฟอร์มแล้ว — กด 'บันทึก' เพื่อใช้กับชุดนี้");
    } catch (e) {
      toast.error((e as Error).message || "ดึงค่าตั้งต้นไม่สำเร็จ");
    } finally {
      setLoadingDefault(false);
    }
  }

  async function save(extra?: Record<string, unknown>) {
    if (!title.trim()) {
      toast.error("กรุณาระบุชื่อชุดแคตตาล็อก");
      return;
    }
    // เปลี่ยนบริษัท = server re-copy หัวจดหมายจากค่าตั้งต้นใหม่ (C-6) → ไม่ส่ง snapshot ทับซ้อน
    const letterheadPayload =
      showLetterhead && !companyChanged
        ? {
            letterhead_snapshot: {
              company_name: letterhead.company_name.trim() || null,
              address_lines: letterhead.address
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
              phone: letterhead.phone.trim() || null,
              tax_id: letterhead.tax_id.trim() || null,
              logo_data_url: letterhead.logo_data_url,
            },
          }
        : {};

    setSaving(true);
    try {
      const res = await govApi<{ catalog: Catalog; letterheadReset?: boolean }>(
        `/api/gov-procure/catalogs/${catalog.id}?orgId=${encodeURIComponent(orgId)}`,
        "PUT",
        {
          title: title.trim(),
          company,
          template,
          show_prices: showPrices,
          order_id: orderId,
          notes,
          ...letterheadPayload,
          ...extra,
        },
      );
      if (res.catalog) onSaved(res.catalog);
      toast.success(
        res.letterheadReset
          ? "บันทึกแล้ว · หัวจดหมายถูกดึงใหม่จากค่าตั้งต้นของบริษัทที่เลือก"
          : "บันทึกการตั้งค่าแล้ว",
      );
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await govApi(
        `/api/gov-procure/catalogs/${catalog.id}?orgId=${encodeURIComponent(orgId)}`,
        "DELETE",
      );
      toast.success("ลบชุดแคตตาล็อกแล้ว");
      onOpenChange(false);
      router.push(`/${orgSlug}/gov-procure/catalogs`);
    } catch (e) {
      toast.error((e as Error).message || "ลบไม่สำเร็จ");
      setSaving(false);
    }
  }

  const orderOptions = [
    { value: "", label: "ยังไม่แนบกับงาน" },
    ...orders.map((o) => ({
      value: o.id,
      label: `${o.qt_reference ?? "ไม่มีเลข QT"} · ${o.customer_name}`,
    })),
  ];

  const companyOptions = [
    { value: "", label: "ยังไม่ระบุบริษัท" },
    ...COMPANIES.map((c) => ({ value: c, label: c })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>ตั้งค่าชุดแคตตาล็อก</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            {locked && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <Text className="text-xs text-amber-700">
                  ชุดนี้กำลังให้ AI เติมข้อมูลอยู่ — เปลี่ยนบริษัท/รูปแบบเอกสารได้หลังทำเสร็จ
                </Text>
              </div>
            )}

            <div>
              <Label htmlFor="set-title">ชื่อชุด *</Label>
              <Input
                id="set-title"
                className="mt-1"
                value={title}
                readOnly={!canWrite}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <Label>บริษัทที่ออกเอกสาร</Label>
              <CustomSelect
                value={company}
                onChange={setCompany}
                options={companyOptions}
                disabled={!canWrite || locked}
                className="mt-1"
              />
              {companyChanged && (
                <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <Text className="text-xs text-amber-700">
                    หัวจดหมายของชุดนี้จะถูกแทนที่ด้วยค่าตั้งต้นของบริษัทใหม่ (ที่แก้เองไว้จะหาย)
                  </Text>
                </div>
              )}
            </div>

            <div>
              <Label>รูปแบบเอกสาร</Label>
              <div className="mt-1">
                <SegmentedControl
                  value={template}
                  onChange={(v) => !locked && canWrite && setTemplate(v)}
                  ariaLabel="รูปแบบเอกสาร"
                  options={[
                    { value: "table", label: "ตาราง" },
                    { value: "narrative", label: "บรรยาย" },
                  ]}
                />
              </div>
              <Text className="mt-1 text-xs text-gray-500">{TEMPLATE_HINT[template]}</Text>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div className="min-w-0 pr-3">
                <Text className="text-sm font-medium text-gray-900">แสดงราคาในเอกสาร</Text>
                <Text className="text-xs text-gray-500">
                  ปิดไว้เมื่อยื่นเฉพาะสเปก (ยังแก้ได้ทุกครั้งก่อนส่งออก)
                </Text>
              </div>
              <Switch
                checked={showPrices}
                onChange={setShowPrices}
                disabled={!canWrite}
                aria-label="แสดงราคาในเอกสาร"
              />
            </div>

            {showLetterhead && (
              <div className="space-y-3 rounded-lg border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text className="text-sm font-medium text-gray-900">หัวจดหมายของชุดนี้</Text>
                  {canWrite && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loadingDefault || !company}
                      onClick={() => void loadCompanyDefault()}
                    >
                      {loadingDefault ? "กำลังดึง…" : "ดึงค่าตั้งต้นของบริษัทมาใหม่"}
                    </Button>
                  )}
                </div>
                <Text className="text-xs text-gray-500">
                  ค่าเหล่านี้เป็นสำเนาของชุดนี้เท่านั้น —
                  แก้แล้วไม่กระทบชุดอื่นหรือค่าตั้งต้นของบริษัท ·
                  พิมพ์บนหัวทุกหน้าของเอกสารแบบบรรยาย
                </Text>

                <div>
                  <Label htmlFor="lh-company-name">ชื่อบริษัทที่จะพิมพ์</Label>
                  <Input
                    id="lh-company-name"
                    className="mt-1"
                    value={letterhead.company_name}
                    readOnly={!canWrite}
                    placeholder="เช่น บริษัท 89 โกลบอลเวิร์ค จำกัด"
                    onChange={(e) => setLh("company_name", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="lh-address">ที่อยู่ (บรรทัดละ 1 บรรทัด สูงสุด 6 บรรทัด)</Label>
                  <Textarea
                    id="lh-address"
                    className="mt-1"
                    rows={3}
                    value={letterhead.address}
                    readOnly={!canWrite}
                    onChange={(e) => setLh("address", e.target.value)}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="lh-phone">โทรศัพท์</Label>
                    <Input
                      id="lh-phone"
                      className="mt-1"
                      value={letterhead.phone}
                      readOnly={!canWrite}
                      onChange={(e) => setLh("phone", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lh-tax">เลขประจำตัวผู้เสียภาษี</Label>
                    <Input
                      id="lh-tax"
                      className="mt-1 tabular-nums"
                      value={letterhead.tax_id}
                      readOnly={!canWrite}
                      onChange={(e) => setLh("tax_id", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Text className="mb-1.5 text-xs font-medium text-gray-700">โลโก้</Text>
                  {canWrite ? (
                    <ImageUpload
                      value={letterhead.logo_data_url}
                      onChange={changeLogo}
                      label="อัปโหลดโลโก้"
                      accept="image/png,image/jpeg,image/webp"
                      previewClassName="h-16 w-16"
                    />
                  ) : (
                    <Text className="text-xs text-gray-500">
                      {letterhead.logo_data_url ? "มีโลโก้แล้ว" : "ยังไม่มีโลโก้"}
                    </Text>
                  )}
                  <Text className="mt-1 text-xs text-gray-500">
                    รองรับ PNG / JPEG / WebP ขนาดไม่เกิน 500 KB
                  </Text>
                </div>

                {companyChanged && (
                  <Text className="text-xs text-amber-700">
                    กำลังเปลี่ยนบริษัท — เมื่อกดบันทึก ระบบจะดึงหัวจดหมายของบริษัทใหม่มาแทน
                    (สิ่งที่แก้ในกล่องนี้จะไม่ถูกบันทึก)
                  </Text>
                )}
              </div>
            )}

            <div>
              <Label>แนบกับงาน</Label>
              <CustomSelect
                value={orderId}
                onChange={setOrderId}
                options={orderOptions}
                disabled={!canWrite}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="set-notes">หมายเหตุ</Label>
              <Textarea
                id="set-notes"
                className="mt-1"
                rows={2}
                value={notes}
                readOnly={!canWrite}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {canWrite && catalog.status !== "enriching" && (
              <div className="rounded-lg border border-gray-200 p-3">
                <Text className="text-sm font-medium text-gray-900">สถานะชุด</Text>
                <Text className="mt-0.5 text-xs text-gray-500">
                  {catalog.status === "approved"
                    ? "ชุดนี้อนุมัติแล้ว — กลับไปแก้ไขได้โดยเปลี่ยนกลับเป็น 'รอตรวจสอบ'"
                    : verifiedAll
                      ? "ตรวจครบทุกรายการแล้ว — อนุมัติเพื่อใช้แนบซองได้เลย"
                      : "ยังมีรายการที่ AI เดายังไม่ผ่านตา — อนุมัติได้แต่เสี่ยงข้อมูลผิด"}
                </Text>
                <div className="mt-2">
                  {catalog.status === "approved" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => void save({ status: "review" })}
                    >
                      กลับไปแก้ไข (รอตรวจสอบ)
                    </Button>
                  ) : (
                    <Button
                      variant={verifiedAll ? "default" : "destructive"}
                      size="sm"
                      disabled={saving}
                      onClick={() => void save({ status: "approved" })}
                    >
                      {verifiedAll ? "อนุมัติชุดนี้" : "อนุมัติทั้งที่ยังตรวจไม่ครบ"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          {canDelete && (
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={saving}
              onClick={() => void remove()}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              {confirmDelete ? "กดอีกครั้งเพื่อลบถาวร" : "ลบชุดนี้"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ปิด
          </Button>
          {canWrite && (
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
