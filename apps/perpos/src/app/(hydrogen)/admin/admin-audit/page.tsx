import { StatusBadge, type BadgeTone } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmpty,
} from "@/components/ui/table";
import { LinkTablePager } from "@/components/ui/table-pager";
import { ScrollText } from "lucide-react";
import { requireSuperAdminPage } from "@/lib/admin/guard";
import { getAdminAudit } from "@/lib/admin/admin-audit";
import { AdminPage } from "../_components/admin-page";
import { AuditActionFilter } from "./_filter";

// tone ตามหมวด action
const actionTone = (a: string): BadgeTone => {
  if (
    a.includes("delete") ||
    a.includes("cancel") ||
    a.includes("deactivate") ||
    a.includes("remove") ||
    a.includes("fail")
  )
    return "danger";
  if (a.startsWith("impersonate") || a.includes("reset_password")) return "warning";
  return "neutral";
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

// สร้าง href หน้าถัดไป/ก่อนหน้า (คง action filter ไว้)
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const admin = await requireSuperAdminPage();
  const sp = await searchParams;
  const action = sp.action ?? "";
  const reqPage = Math.max(1, Number(sp.page ?? 1));

  const { items, total, page, limit, actions } = await getAdminAudit(admin, {
    page: reqPage,
    action,
  });

  return (
    <AdminPage
      width="wide"
      title="บันทึกการจัดการ (Admin Audit)"
      icon={<ScrollText className="h-6 w-6" />}
      actions={<AuditActionFilter actions={actions} current={action} />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เวลา</TableHead>
            <TableHead>ผู้ดำเนินการ</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>เป้าหมาย</TableHead>
            <TableHead>รายละเอียด</TableHead>
            <TableHead>IP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableEmpty colSpan={6}>ยังไม่มีบันทึก</TableEmpty>
          ) : (
            items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-gray-500">{fmtTime(e.created_at)}</TableCell>
                <TableCell className="text-gray-700">
                  {e.actor_email ?? <span className="text-gray-400">—</span>}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={actionTone(e.action)}>{e.action}</StatusBadge>
                </TableCell>
                <TableCell className="text-gray-700">
                  {e.target_label || e.target_id ? (
                    <div>
                      <div>{e.target_label ?? e.target_id}</div>
                      {e.target_type && (
                        <div className="text-xs text-gray-400">{e.target_type}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {e.metadata && Object.keys(e.metadata).length > 0 ? (
                    <code
                      className="block max-w-[280px] truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-600"
                      title={JSON.stringify(e.metadata)}
                    >
                      {JSON.stringify(e.metadata)}
                    </code>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-gray-400">{e.ip_address ?? "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <LinkTablePager
        page={page}
        pageSize={limit}
        total={total}
        query={{ action }}
        className="mt-4"
      />
    </AdminPage>
  );
}
