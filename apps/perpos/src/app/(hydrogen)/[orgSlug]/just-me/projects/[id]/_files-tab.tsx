"use client";

/**
 * _files-tab.tsx — แบบ/รูปสำรวจ/สัญญาของโครงการ
 * อัปโหลด: ขอ signed upload URL → ยิงไฟล์ตรงเข้า bucket (private) → ลงทะเบียนเมทาดาทา
 * เปิดไฟล์: ขอ signed URL อายุ 60 วิ ทุกครั้ง (ไม่เก็บลิงก์ค้างไว้)
 */

import { useMemo, useState } from "react";
import { Download, FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { PageCard } from "@/components/ui/page-shell";
import { SegmentedControl } from "@/components/ui/segmented";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePager, usePagination } from "@/components/ui/table-pager";
import { Text } from "@/components/ui/typography";
import { notify } from "@/lib/toast";
import { PROJECT_FILE_KIND_LABEL } from "@/lib/just-me/labels";
import type { JustMeProjectFile, ProjectFileKind } from "@/lib/just-me/types";
import { jmGet, jmSend, jmUploadToSignedUrl } from "../../_components/api-client";
import { thaiDate } from "../../_components/format";

const KIND_OPTIONS = (Object.keys(PROJECT_FILE_KIND_LABEL) as ProjectFileKind[]).map((k) => ({
  value: k,
  label: PROJECT_FILE_KIND_LABEL[k],
}));

const FILTER_OPTIONS = [{ value: "", label: "ทุกประเภท" }, ...KIND_OPTIONS];

function sizeText(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FilesTab({
  orgId,
  projectId,
  canWrite,
  files,
  onChanged,
}: {
  orgId: string;
  projectId: string;
  canWrite: boolean;
  files: JustMeProjectFile[];
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<ProjectFileKind>("survey_photo");
  const [filter, setFilter] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<JustMeProjectFile | null>(null);

  const rows = useMemo(
    () => (filter ? files.filter((f) => f.file_kind === filter) : files),
    [files, filter],
  );
  const pager = usePagination(rows, { pageSize: 10, resetKey: filter });

  async function upload(list: File[]) {
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const file of list) {
        const up = await jmSend<{ path: string; signedUrl: string }>(
          orgId,
          `projects/${projectId}/files`,
          "POST",
          { action: "upload-url", file_name: file.name, size_bytes: file.size },
        );
        await jmUploadToSignedUrl(up.signedUrl, file);
        await jmSend(orgId, `projects/${projectId}/files`, "POST", {
          storage_path: up.path,
          file_name: file.name,
          file_kind: kind,
          mime_type: file.type || null,
          size_bytes: file.size,
        });
      }
      notify.success(`อัปโหลดแล้ว ${list.length.toLocaleString("th-TH")} ไฟล์`);
      onChanged();
    } catch (e) {
      notify.error(e, "อัปโหลดไฟล์ไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function openFile(file: JustMeProjectFile) {
    setBusy(true);
    try {
      const res = await jmGet<{ url: string }>(orgId, `projects/${projectId}/files/${file.id}/url`);
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      notify.error(e, "เปิดไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(file: JustMeProjectFile) {
    setBusy(true);
    try {
      await jmSend(orgId, `projects/${projectId}/files?fileId=${file.id}`, "DELETE");
      notify.deleted("ลบไฟล์แล้ว");
      setSelected(null);
      onChanged();
    } catch (e) {
      notify.error(e, "ลบไฟล์ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <PageCard title="อัปโหลดไฟล์">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Text className="text-sm text-gray-600">ประเภทไฟล์ที่จะอัปโหลด</Text>
              <SegmentedControl
                value={kind}
                onChange={(v) => setKind(v as ProjectFileKind)}
                options={KIND_OPTIONS}
                ariaLabel="ประเภทไฟล์"
              />
            </div>
            <FileDropzone
              multiple
              onFiles={upload}
              accept="image/*,application/pdf"
              maxSizeMb={50}
              hint="รูปสำรวจ / แบบ / สัญญา — รูปภาพหรือ PDF ขนาดไม่เกิน 50 MB"
            />
            {uploading && <Text className="text-xs text-gray-500">กำลังอัปโหลด…</Text>}
          </div>
        </PageCard>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={filter}
          onChange={setFilter}
          options={FILTER_OPTIONS}
          className="w-40"
        />
        <Text className="text-xs text-gray-500">
          ทั้งหมด {files.length.toLocaleString("th-TH")} ไฟล์
        </Text>
      </div>

      <Table stickyHeader fillViewport>
        <TableHeader sticky>
          <TableRow>
            <TableHead>ชื่อไฟล์</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead align="right">ขนาด</TableHead>
            <TableHead>อัปโหลดเมื่อ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pager.rows.length === 0 ? (
            <TableEmpty colSpan={4}>
              <div className="flex flex-col items-center gap-2 py-6">
                <div className="rounded-full bg-gray-100 p-4">
                  <FileStack className="h-8 w-8 text-gray-400" />
                </div>
                <Text className="text-sm font-medium text-gray-900">ยังไม่มีไฟล์</Text>
                <Text className="text-sm text-gray-500">
                  {canWrite
                    ? "ลากรูปหน้างานหรือไฟล์แบบมาวางในกล่องด้านบนได้เลย"
                    : "ยังไม่มีใครอัปโหลดไฟล์ของโครงการนี้"}
                </Text>
              </div>
            </TableEmpty>
          ) : (
            pager.rows.map((file) => (
              <TableRow key={file.id} clickable onClick={() => setSelected(file)}>
                <TableCell className="font-medium text-gray-900">{file.file_name}</TableCell>
                <TableCell>{PROJECT_FILE_KIND_LABEL[file.file_kind] ?? file.file_kind}</TableCell>
                <TableCell align="right" tabular>
                  {sizeText(file.size_bytes)}
                </TableCell>
                <TableCell>{thaiDate(file.created_at)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <TablePager pager={pager} unit="ไฟล์" />

      <Dialog open={selected !== null} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>ไฟล์ของโครงการ</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {selected && (
              <div className="space-y-2">
                <Text className="text-sm font-medium text-gray-900">{selected.file_name}</Text>
                <Text className="text-xs text-gray-500">
                  {PROJECT_FILE_KIND_LABEL[selected.file_kind] ?? selected.file_kind} ·{" "}
                  {sizeText(selected.size_bytes)} · อัปโหลด {thaiDate(selected.created_at)}
                </Text>
                <Text className="text-xs text-gray-500">
                  ลิงก์เปิดไฟล์มีอายุ 60 วินาที และออกใหม่ทุกครั้งที่กด
                </Text>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {canWrite && selected && (
              <Button
                variant="destructive"
                className="mr-auto"
                disabled={busy}
                onClick={() => removeFile(selected)}
              >
                {busy ? "กำลังลบ…" : "ลบไฟล์"}
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelected(null)} disabled={busy}>
              ปิด
            </Button>
            <Button disabled={busy || !selected} onClick={() => selected && openFile(selected)}>
              <Download className="h-4 w-4" /> เปิดไฟล์
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
