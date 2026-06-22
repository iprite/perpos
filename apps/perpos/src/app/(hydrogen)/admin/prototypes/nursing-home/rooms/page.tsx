"use client";

// ห้อง & เตียง — ผังห้อง/เตียง + occupancy KPI + เพิ่มห้อง/เตียง + ย้ายผู้พัก (interactive)
// guard อยู่ที่ layout.tsx · gate ปุ่มด้วย useNursingRole (rooms = owner/admin_staff = W)

import { useMemo, useState } from "react";
import { BedDouble, Plus, ArrowRightLeft, DoorOpen, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatCard } from "@/components/ui/stat-card";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";

import { ROOMS, BEDS, RESIDENTS } from "../_fixtures";
import type { Bed, BedStatus, Room } from "../_fixtures/types";
import { NursingShell, useNursingRole, BedStatusBadge, fullName } from "../_components";

const BED_STATUS_OPTS: { value: BedStatus; label: string }[] = [
  { value: "available", label: "ว่าง" },
  { value: "occupied", label: "มีผู้พัก" },
  { value: "reserved", label: "จองแล้ว" },
  { value: "maintenance", label: "ปิดซ่อม" },
];

export default function RoomsPage() {
  const { can } = useNursingRole();
  const canWrite = can("write", "rooms");

  const [rooms, setRooms] = useState<Room[]>(ROOMS);
  const [beds, setBeds] = useState<Bed[]>(BEDS);
  // resident bed mapping (ย้ายผู้พัก = แก้ bed_id ใน state นี้)
  const [residentBed, setResidentBed] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(RESIDENTS.map((r) => [r.id, r.bed_id ?? null])),
  );

  const [roomDlg, setRoomDlg] = useState(false);
  const [bedDlg, setBedDlg] = useState<{ open: boolean; roomId: string }>({
    open: false,
    roomId: "",
  });
  const [moveDlg, setMoveDlg] = useState<{ open: boolean; residentId: string; fromBed: string }>({
    open: false,
    residentId: "",
    fromBed: "",
  });

  // ── ชื่อผู้พักต่อเตียง (จาก residentBed state) ──
  const occupantByBed = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of RESIDENTS) {
      const bid = residentBed[r.id];
      if (bid && r.status === "active") map[bid] = fullName(r);
    }
    return map;
  }, [residentBed]);

  const kpi = useMemo(() => {
    const total = beds.length;
    const occupied = beds.filter((b) => b.status === "occupied").length;
    const available = beds.filter((b) => b.status === "available").length;
    const pct = total ? Math.round((occupied / total) * 100) : 0;
    return { total, occupied, available, pct };
  }, [beds]);

  const bedsByRoom = useMemo(() => {
    const map: Record<string, Bed[]> = {};
    for (const b of beds) (map[b.room_id] ??= []).push(b);
    return map;
  }, [beds]);

  const availableBeds = beds.filter((b) => b.status === "available");

  function addRoom(r: Room) {
    setRooms((prev) => [...prev, r]);
    toast.success(`เพิ่ม${r.name}แล้ว`);
  }
  function addBed(b: Bed) {
    setBeds((prev) => [...prev, b]);
    toast.success(`เพิ่มเตียง ${b.name} แล้ว`);
  }
  function moveResident(residentId: string, fromBed: string, toBed: string) {
    setResidentBed((prev) => ({ ...prev, [residentId]: toBed }));
    setBeds((prev) =>
      prev.map((b) => {
        if (b.id === fromBed) return { ...b, status: "available" as BedStatus };
        if (b.id === toBed) return { ...b, status: "occupied" as BedStatus };
        return b;
      }),
    );
    toast.success("ย้ายผู้พักเรียบร้อย");
  }

  return (
    <NursingShell
      title="ห้อง & เตียง"
      icon={<BedDouble className="h-6 w-6" />}
      description="ผังห้องพักและสถานะเตียง — เห็นเตียงว่างได้ทันที ลดเวลาจัดที่พักผู้พักใหม่"
      actions={
        canWrite ? (
          <Button onClick={() => setRoomDlg(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> เพิ่มห้อง
          </Button>
        ) : null
      }
    >
      {/* KPI */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<BedDouble className="h-4 w-4" />}
          label="อัตราเข้าพัก"
          value={`${kpi.pct}%`}
          sub={`${kpi.occupied}/${kpi.total} เตียง`}
          tone="info"
          valueColored
        />
        <StatCard
          icon={<DoorOpen className="h-4 w-4" />}
          label="เตียงว่าง"
          value={String(kpi.available)}
          sub="พร้อมรับผู้พักใหม่"
          tone={kpi.available > 0 ? "positive" : "neutral"}
          valueColored
        />
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="ห้องทั้งหมด"
          value={String(rooms.length)}
          sub={`${kpi.total} เตียงรวม`}
          tone="primary"
        />
      </div>

      {/* ผังห้อง */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {rooms.map((room) => {
          const rbeds = bedsByRoom[room.id] ?? [];
          return (
            <div key={room.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-medium text-gray-900">{room.name}</div>
                  <div className="text-xs text-gray-500">
                    ชั้น {room.floor ?? "—"} · {room.room_type} · จุได้ {room.capacity}
                    {room.note ? ` · ${room.note}` : ""}
                  </div>
                </div>
                {canWrite && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBedDlg({ open: true, roomId: room.id })}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> เตียง
                  </Button>
                )}
              </div>
              {rbeds.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                  ยังไม่มีเตียงในห้องนี้
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {rbeds.map((bed) => {
                    const occupant = occupantByBed[bed.id];
                    return (
                      <div
                        key={bed.id}
                        className="flex flex-col gap-1.5 rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900">{bed.name}</span>
                          <BedStatusBadge status={bed.status} />
                        </div>
                        {bed.status === "occupied" && occupant ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-gray-600">{occupant}</span>
                            {canWrite && availableBeds.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const rid =
                                    RESIDENTS.find((r) => residentBed[r.id] === bed.id)?.id ?? "";
                                  setMoveDlg({ open: true, residentId: rid, fromBed: bed.id });
                                }}
                                className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                <ArrowRightLeft className="h-3 w-3" /> ย้าย
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">{bed.note ?? "—"}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddRoomDialog
        open={roomDlg}
        onOpenChange={setRoomDlg}
        count={rooms.length}
        onAdd={addRoom}
      />
      <AddBedDialog
        state={bedDlg}
        onClose={() => setBedDlg({ open: false, roomId: "" })}
        roomName={rooms.find((r) => r.id === bedDlg.roomId)?.name ?? ""}
        onAdd={addBed}
      />
      <MoveResidentDialog
        state={moveDlg}
        onClose={() => setMoveDlg({ open: false, residentId: "", fromBed: "" })}
        residentName={
          RESIDENTS.find((r) => r.id === moveDlg.residentId)
            ? fullName(RESIDENTS.find((r) => r.id === moveDlg.residentId)!)
            : ""
        }
        availableBeds={availableBeds}
        onMove={moveResident}
      />
    </NursingShell>
  );
}

function AddRoomDialog({
  open,
  onOpenChange,
  count,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  onAdd: (r: Room) => void;
}) {
  const [name, setName] = useState("");
  const [floor, setFloor] = useState("1");
  const [type, setType] = useState("เดี่ยว");
  const [cap, setCap] = useState("1");

  function submit() {
    if (!name.trim()) {
      toast.error("กรุณากรอกชื่อห้อง");
      return;
    }
    onAdd({
      id: `room-new-${count + 1}`,
      name: name.trim(),
      floor: Number(floor) || null,
      room_type: type,
      capacity: Number(cap) || 1,
      note: null,
    });
    setName("");
    setFloor("1");
    setType("เดี่ยว");
    setCap("1");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>เพิ่มห้องพัก</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rm-name">ชื่อห้อง *</Label>
              <Input
                id="rm-name"
                className="mt-1"
                placeholder="เช่น ห้อง 105"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="rm-floor">ชั้น</Label>
                <Input
                  id="rm-floor"
                  type="number"
                  className="mt-1"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rm-cap">จำนวนเตียง (จุได้)</Label>
                <Input
                  id="rm-cap"
                  type="number"
                  className="mt-1"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="rm-type">ประเภท</Label>
              <Input
                id="rm-type"
                className="mt-1"
                placeholder="เดี่ยว / คู่ / รวม / VIP"
                value={type}
                onChange={(e) => setType(e.target.value)}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ยกเลิก
          </Button>
          <Button onClick={submit}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddBedDialog({
  state,
  onClose,
  roomName,
  onAdd,
}: {
  state: { open: boolean; roomId: string };
  onClose: () => void;
  roomName: string;
  onAdd: (b: Bed) => void;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<BedStatus>("available");

  function submit() {
    if (!name.trim()) {
      toast.error("กรุณากรอกชื่อเตียง");
      return;
    }
    onAdd({
      id: `bed-new-${Date.now()}`,
      room_id: state.roomId,
      name: name.trim(),
      status,
      note: null,
    });
    setName("");
    setStatus("available");
    onClose();
  }

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>เพิ่มเตียง — {roomName}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <div>
              <Label htmlFor="bd-name">ชื่อเตียง *</Label>
              <Input
                id="bd-name"
                className="mt-1"
                placeholder="เช่น 105-A"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bd-status">สถานะ</Label>
              <CustomSelect
                className="mt-1"
                value={status}
                onChange={(v) => setStatus(v as BedStatus)}
                options={BED_STATUS_OPTS}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={submit}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveResidentDialog({
  state,
  onClose,
  residentName,
  availableBeds,
  onMove,
}: {
  state: { open: boolean; residentId: string; fromBed: string };
  onClose: () => void;
  residentName: string;
  availableBeds: Bed[];
  onMove: (residentId: string, fromBed: string, toBed: string) => void;
}) {
  const [toBed, setToBed] = useState("");

  function submit() {
    if (!toBed) {
      toast.error("กรุณาเลือกเตียงปลายทาง");
      return;
    }
    onMove(state.residentId, state.fromBed, toBed);
    setToBed("");
    onClose();
  }

  return (
    <Dialog open={state.open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>ย้ายผู้พัก</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              ย้าย <span className="font-medium text-gray-900">{residentName || "—"}</span>{" "}
              ไปยังเตียงว่าง
            </p>
            <div>
              <Label htmlFor="mv-bed">เตียงปลายทาง (ว่าง) *</Label>
              <CustomSelect
                className="mt-1"
                value={toBed}
                onChange={setToBed}
                options={[
                  { value: "", label: "— เลือกเตียง —" },
                  ...availableBeds.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={submit}>ย้าย</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
