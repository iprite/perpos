"use client";

import { useAuth } from "@/app/shared/auth-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMedia } from "@core/hooks/use-media";
import cn from "@core/utils/class-names";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PiCheck } from "react-icons/pi";
import { ActionIcon } from "rizzui/action-icon";
import { Badge, Popover, Text, Title } from "rizzui";
import RingBellSolidIcon from "@core/components/icons/ring-bell-solid";

dayjs.extend(relativeTime);

type NotificationRow = {
  id: string;
  message: string;
  severity: "info" | "warning" | "danger";
  is_read: boolean;
  created_at: string;
};

function NotificationsList({
  setIsOpen,
  rows,
  loading,
  onMarkRead,
}: {
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  rows: NotificationRow[];
  loading: boolean;
  onMarkRead: (id: string) => void;
}) {
  return (
    <div className="w-[320px] text-left sm:w-[360px] 2xl:w-[420px] rtl:text-right">
      <div className="mb-2 flex items-center justify-between ps-6">
        <Title as="h5" fontWeight="semibold">
          Notifications
        </Title>
        <Link href="/notifications" onClick={() => setIsOpen(false)} className="hover:underline">
          View all
        </Link>
      </div>

      <div className="custom-scrollbar overflow-y-auto scroll-smooth max-h-[406px]">
        <div className="grid grid-cols-1 ps-4">
          {loading ? (
            <div className="px-2 py-6 text-sm text-gray-500">กำลังโหลด...</div>
          ) : rows.length === 0 ? (
            <div className="px-2 py-6 text-sm text-gray-500">ยังไม่มีการแจ้งเตือน</div>
          ) : (
            rows.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.is_read) onMarkRead(item.id);
                }}
                className={cn(
                  "group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-2.5 pe-3 text-left transition-colors",
                  "hover:bg-gray-100 dark:hover:bg-gray-50"
                )}
              >
                <div className="w-full">
                  <Text className="mb-0.5 w-11/12 truncate text-sm font-semibold text-gray-900 dark:text-gray-700">
                    {item.message}
                  </Text>
                  <div className="flex">
                    <Text className="ms-auto whitespace-nowrap pe-8 text-xs text-gray-500">
                      {dayjs(item.created_at).fromNow(true)}
                    </Text>
                  </div>
                </div>
                <div className="ms-auto flex-shrink-0">
                  {!item.is_read ? (
                    <Badge renderAsDot size="lg" color="primary" className="scale-90" />
                  ) : (
                    <span className="inline-block rounded-full bg-gray-100 p-0.5 dark:bg-gray-50">
                      <PiCheck className="h-auto w-[9px]" />
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotificationsDropdown() {
  const isMobile = useMedia("(max-width: 480px)", false);
  const { userId } = useAuth();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    Promise.resolve().then(async () => {
      try {
        const countRes = await supabase
          .from("notifications")
          .select("id")
          .eq("to_profile_id", userId)
          .eq("is_read", false)
          .limit(1);
        if (cancelled) return;
        if (!countRes.error) setUnreadCount((countRes.data ?? []).length ? 1 : 0);
      } catch {
        if (cancelled) return;
        setUnreadCount(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  useEffect(() => {
    if (!isOpen) return;
    if (!userId) return;

    let cancelled = false;
    Promise.resolve().then(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("notifications")
          .select("id,message,severity,is_read,created_at")
          .eq("to_profile_id", userId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (!cancelled) {
          if (!error) setRows(((data ?? []) as NotificationRow[]) ?? []);
        }

        const countRes = await supabase
          .from("notifications")
          .select("id")
          .eq("to_profile_id", userId)
          .eq("is_read", false)
          .limit(1);
        if (!cancelled) {
          if (!countRes.error) setUnreadCount((countRes.data ?? []).length ? 1 : 0);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setUnreadCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, supabase, userId]);

  const markRead = async (id: string) => {
    if (!userId) return;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_read: true } : r)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };

  return (
    <Popover
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      shadow="sm"
      placement={isMobile ? "bottom" : "bottom-end"}
    >
      <Popover.Trigger>
        <ActionIcon
          aria-label="Notification"
          variant="text"
          className="relative h-[34px] w-[34px] rounded-full md:h-9 md:w-9 hover:bg-gray-100"
        >
          <RingBellSolidIcon className="h-[18px] w-auto" />
          {unreadCount > 0 ? (
            <Badge
              renderAsDot
              color="warning"
              enableOutlineRing
              className="absolute right-2.5 top-2.5 -translate-y-1/3 translate-x-1/2"
            />
          ) : null}
        </ActionIcon>
      </Popover.Trigger>
      <Popover.Content className="z-[9999] pb-6 pe-6 ps-0 pt-5 dark:bg-gray-100 [&>svg]:hidden [&>svg]:dark:fill-gray-100 sm:[&>svg]:inline-flex">
        <NotificationsList setIsOpen={setIsOpen} rows={rows} loading={loading} onMarkRead={markRead} />
      </Popover.Content>
    </Popover>
  );
}
