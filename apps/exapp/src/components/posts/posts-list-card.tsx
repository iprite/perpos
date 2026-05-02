"use client";

import React, { useMemo, useState } from "react";
import { Button } from "rizzui";
import TablePagination from "@core/components/table/pagination";
import { getCoreRowModel, getPaginationRowModel, useReactTable } from "@tanstack/react-table";
import Image from "next/image";

import TableSearch from "@/components/table/table-search";

export type PostRow = {
  id: string;
  title: string;
  slug: string;
  description: string;
  content_html: string;
  image_url: string | null;
  image_path: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

function formatDateTH(iso: string | null | undefined) {
  const s = String(iso ?? "");
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function dateBadgeText(iso: string | null | undefined) {
  return formatDateTH(iso);
}

export function PostsListCard(props: {
  rows: PostRow[];
  loading: boolean;
  search: string;
  onChangeSearch: (v: string) => void;
  onCreate: () => void;
  onEdit: (row: PostRow) => void;
}) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [props.rows.length, props.search]);

  const filteredRows = useMemo(() => {
    const q = props.search.trim().toLowerCase();
    if (!q) return props.rows;
    return props.rows.filter((r) => {
      const hay = [r.title, r.slug, r.description, (r.tags ?? []).join(" ")].map((x) => String(x ?? "").toLowerCase()).join(" ");
      return hay.includes(q);
    });
  }, [props.rows, props.search]);

  const table = useReactTable({
    data: filteredRows,
    columns: useMemo(() => [{ accessorKey: "id" }], []),
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-col gap-2 border-b border-gray-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm font-semibold text-gray-900">รายการโพสต์</div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          <TableSearch value={props.search} onChange={props.onChangeSearch} disabled={props.loading} />
          <Button onClick={props.onCreate} disabled={props.loading}>
            สร้างโพสต์
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[920px] overflow-hidden rounded-xl">
          <div className="grid grid-cols-[1.6fr_1fr_0.8fr] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
            <div>หัวข้อ</div>
            <div>Slug</div>
            <div>อัปเดต</div>
          </div>

          {filteredRows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-gray-500">{props.loading ? "กำลังโหลด..." : "ยังไม่มีโพสต์"}</div>
          ) : (
            table.getRowModel().rows.map((row) => {
              const r = row.original as PostRow;
              const imageSrc = r.image_url ? String(r.image_url) : null;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => props.onEdit(r)}
                  className="grid w-full grid-cols-[1.6fr_1fr_0.8fr] items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 last:border-b-0"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative mt-0.5 h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                      {imageSrc ? (
                        <Image src={imageSrc} alt={r.title || "post"} fill sizes="40px" className="object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-500">IMG</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="whitespace-normal break-words text-sm font-medium text-gray-900">{r.title || "-"}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{r.description || "-"}</div>
                    </div>
                  </div>
                  <div className="truncate text-sm text-gray-900">{r.slug || "-"}</div>
                  <div className="flex">
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700">
                      {dateBadgeText(r.updated_at)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <TablePagination table={table} />
    </div>
  );
}
