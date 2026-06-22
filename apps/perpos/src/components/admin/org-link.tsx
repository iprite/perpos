"use client";

/**
 * OrgLink / useOrgDrawer — เปิด Org 360° Drawer จากที่ไหนก็ได้ในหน้า admin
 *
 *   <OrgLink orgId={o.id}>{o.name}</OrgLink>
 * หรือ
 *   const openOrg = useOrgDrawer(); ... openOrg(orgId)
 */

import { useCallback } from "react";
import cn from "@core/utils/class-names";
import { useDrawer } from "@/app/shared/drawer-views/use-drawer";
import { OrgDetailDrawer } from "./org-detail-drawer";

export function useOrgDrawer() {
  const { openDrawer } = useDrawer();
  return useCallback(
    (orgId: string) => {
      openDrawer({
        view: <OrgDetailDrawer orgId={orgId} />,
        placement: "right",
        customSize: 460,
      });
    },
    [openDrawer],
  );
}

export function OrgLink({
  orgId,
  children,
  className,
}: {
  orgId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const openOrg = useOrgDrawer();
  return (
    <button
      type="button"
      // stopPropagation → ปลอดภัยเมื่อวางในแถวที่คลิกได้ (เช่น billing/health row)
      onClick={(e) => {
        e.stopPropagation();
        openOrg(orgId);
      }}
      className={cn(
        "rounded text-left underline-offset-2 transition-colors hover:text-primary hover:underline",
        className,
      )}
    >
      {children}
    </button>
  );
}
