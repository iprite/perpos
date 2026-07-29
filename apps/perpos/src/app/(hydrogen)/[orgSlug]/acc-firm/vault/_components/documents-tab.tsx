"use client";

// documents-tab.tsx — เอกสารทั้งหมดของลูกค้า + ดาวน์โหลด (signed URL 60 วิ ใช้แล้วทิ้ง)
// เอกสารข้อมูลอ่อนไหว: ต้องยืนยันใน Dialog ก่อน + เฉพาะสิทธิ์ owner (ตรงกับด่านฝั่ง API)

import { useMemo, useState } from "react";
import { Download, FileText, ShieldAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import { FilterBar, FilterSearch, FilterClear } from "@/components/ui/filter-bar";
import { StatusBadge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { toast } from "@/lib/toast";
import {
  DOCUMENT_STATUS_LABELS,
  SOURCE_LABELS,
  type VaultCategory,
  type VaultDocument,
} from "@/lib/acc-firm/vault/types";
import { useVaultApi } from "./api";
import { UploadDocumentDialog } from "./upload-dialog";
import { fmtBytes, fmtDate, fmtDateTime } from "./format";

const DOC_STATUS_TONE: Record<VaultDocument["status"], "neutral" | "success" | "warning"> = {
  draft: "neutral",
  active: "success",
  superseded: "neutral",
  pending_purge: "warning",
  purged: "neutral",
};

export function DocumentsTab({
  orgId,
  clientId,
  fiscalYear,
  canWrite,
  canDownloadSensitive,
  documents: initialDocuments,
  categories,
}: {
  orgId: string;
  clientId: string;
  fiscalYear: number;
  canWrite: boolean;
  canDownloadSensitive: boolean;
  documents: VaultDocument[];
  categories: VaultCategory[];
}) {
  const api = useVaultApi(orgId);
  const [documents, setDocuments] = useState(initialDocuments);
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDoc, setConfirmDoc] = useState<VaultDocument | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () => [
      { value: "", label: "ทุกประเภท" },
      ...categories
        .filter((c) => documents.some((d) => d.categoryId === c.id))
        .map((c) => ({ value: c.id, label: c.nameTh })),
    ],
    [categories, documents],
  );

  const rows = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    return documents.filter((d) => {
      if (categoryId && d.categoryId !== categoryId) return false;
      if (!keyword) return true;
      return [d.title, d.categoryName, d.counterparty ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [documents, q, categoryId]);
  const pager = usePagination(rows);

  async function reload() {
    try {
      const res = await api.fetchDocuments(clientId);
      setDocuments(res.documents as VaultDocument[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "โหลดเอกสารไม่สำเร็จ");
    }
  }

  async function download(doc: VaultDocument) {
    setDownloadingId(doc.id);
    try {
      await api.openDownload(doc.id);
      toast.success("เปิดไฟล์แล้ว — ลิงก์นี้หมดอายุใน 60 วินาที");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "เปิดไฟล์ไม่สำเร็จ");
    } finally {
      setDownloadingId(null);
      setConfirmDoc(null);
    }
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        <FilterSearch value={q} onChange={setQ} placeholder="ค้นหา ชื่อเอกสาร / คู่ค้า" />
        <CustomSelect
          value={categoryId}
          onChange={setCategoryId}
          options={categoryOptions}
          className="w-56"
        />
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
            <Upload className="mr-1 h-4 w-4" /> อัปโหลดเอกสาร
          </Button>
        )}
        <FilterClear
          disabled={!q && !categoryId}
          onClick={() => {
            setQ("");
            setCategoryId("");
          }}
        />
      </FilterBar>

      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
          <div className="mb-4 rounded-full bg-gray-100 p-4">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <Text className="text-sm font-medium text-gray-900">ยังไม่มีเอกสารของลูกค้ารายนี้</Text>
          <Text className="mt-1 text-sm text-gray-500">
            อัปโหลดไฟล์แรกเข้าคลัง แล้วระบบจะผูกเข้ากับงวดและรายการที่ต้องเก็บให้อัตโนมัติ
          </Text>
          {canWrite && (
            <Button className="mt-4" size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-1 h-4 w-4" /> อัปโหลดเอกสาร
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Table className="shadow-sm">
            <TableHeader>
              <TableRow>
                <TableHead>ชื่อเอกสาร</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>วันที่เอกสาร</TableHead>
                <TableHead align="center">สถานะ</TableHead>
                <TableHead align="right">ขนาด</TableHead>
                <TableHead>อัปโหลดเมื่อ</TableHead>
                <TableHead align="right">ไฟล์</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableEmpty colSpan={7}>ไม่พบเอกสารที่ตรงกับตัวกรอง</TableEmpty>
              ) : (
                pager.rows.map((d) => {
                  const blocked = d.isSensitive && !canDownloadSensitive;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="text-gray-800">
                        <span className="flex items-center gap-2">
                          {d.title}
                          {d.isSensitive && (
                            <StatusBadge tone="warning">ข้อมูลส่วนบุคคล</StatusBadge>
                          )}
                          {d.legalHold && <StatusBadge tone="danger">ห้ามทำลาย</StatusBadge>}
                        </span>
                        <Text className="mt-0.5 text-xs text-gray-500">
                          ที่มา {SOURCE_LABELS[d.source]}
                          {d.uploadedByName ? ` · โดย ${d.uploadedByName}` : ""}
                        </Text>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        <span className="font-mono text-xs text-gray-400">{d.categoryCode}</span>{" "}
                        {d.categoryName}
                      </TableCell>
                      <TableCell className="text-gray-600">{fmtDate(d.docDate)}</TableCell>
                      <TableCell align="center">
                        <StatusBadge tone={DOC_STATUS_TONE[d.status]}>
                          {DOCUMENT_STATUS_LABELS[d.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell align="right" tabular className="text-gray-600">
                        {fmtBytes(d.sizeBytes)}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {fmtDateTime(d.uploadedAt)}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={blocked || downloadingId === d.id}
                          title={
                            blocked
                              ? "เอกสารข้อมูลส่วนบุคคล — เปิดได้เฉพาะสิทธิ์ Owner ของสำนักงาน"
                              : undefined
                          }
                          onClick={() => (d.isSensitive ? setConfirmDoc(d) : void download(d))}
                        >
                          <Download className="mr-1 h-4 w-4" />
                          {blocked ? "เฉพาะ Owner" : "เปิดไฟล์"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePager pager={pager} />
        </div>
      )}

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        orgId={orgId}
        clientId={clientId}
        fiscalYear={fiscalYear}
        categories={categories}
        onUploaded={() => void reload()}
      />

      <Dialog open={!!confirmDoc} onOpenChange={(v) => !v && setConfirmDoc(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>ยืนยันการเปิดเอกสารข้อมูลส่วนบุคคล</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <Text className="text-sm font-medium text-amber-900">
                  &ldquo;{confirmDoc?.title}&rdquo; มีข้อมูลส่วนบุคคล
                </Text>
                <Text className="mt-1 text-xs text-amber-800">
                  เปิดเท่าที่จำเป็นต่อการทำงานเท่านั้น ห้ามส่งต่อนอกช่องทางของสำนักงาน ·
                  การเปิดครั้งนี้จะถูกบันทึกไว้ (ผู้เปิด เวลา และอุปกรณ์) ตาม PDPA · ลิงก์มีอายุ 60
                  วินาที
                </Text>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDoc(null)}>
              ยกเลิก
            </Button>
            <Button
              disabled={downloadingId === confirmDoc?.id}
              onClick={() => confirmDoc && void download(confirmDoc)}
            >
              {downloadingId === confirmDoc?.id ? "กำลังเปิด…" : "ยืนยันและเปิดไฟล์"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
