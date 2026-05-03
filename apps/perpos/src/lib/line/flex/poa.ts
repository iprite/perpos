function formatShortDateTime(input: string | null) {
  if (!input) return "-";
  const d = new Date(input);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "-";
  const date = new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(d);
  return `${date} ${time}`;
}

function poaStatusLabel(s: string) {
  if (s === "submitted") return "ส่งคำขอแล้ว";
  if (s === "pending") return "รอดำเนินการ";
  if (s === "in_progress") return "กำลังดำเนินการ";
  if (s === "completed") return "เสร็จสิ้น";
  if (s === "cancelled") return "ยกเลิก";
  return s || "-";
}

function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  return x.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function createPoaRequestCreatedFlexMessage(args: {
  reference: string;
  employerName: string;
  representativeName: string;
  poaTypeName: string;
  workerCount: number | null;
  totalPrice: number | null;
  status: string;
  createdAt: string | null;
}) {
  const altText = `คำขอ POA ใหม่ ${args.reference}`;
  const headerColor = "#7C3AED";
  const statusText = poaStatusLabel(String(args.status ?? "").trim());
  const createdText = formatShortDateTime(args.createdAt);
  const wc = Number.isFinite(Number(args.workerCount ?? NaN)) ? String(Math.max(0, Math.trunc(Number(args.workerCount)))) : "-";
  const totalText = args.totalPrice == null ? "-" : `${money(Number(args.totalPrice ?? 0))} บาท`;

  const rows: any[] = [
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "สถานะ", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: statusText, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    ...(args.employerName
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "นายจ้าง", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: args.employerName, size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    ...(args.representativeName
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ตัวแทน", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: args.representativeName, size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    ...(args.poaTypeName
      ? [
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ประเภท", size: "sm", color: "#6B7280", flex: 3 },
              { type: "text", text: args.poaTypeName, size: "sm", color: "#111827", flex: 7, wrap: true },
            ],
          },
        ]
      : []),
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "จำนวน", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: wc === "-" ? "-" : `${wc} คน`, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "ราคารวม", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: totalText, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "เวลา", size: "sm", color: "#6B7280", flex: 3 },
        { type: "text", text: createdText, size: "sm", color: "#111827", flex: 7, wrap: true },
      ],
    },
  ];

  return {
    type: "flex" as const,
    altText,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: headerColor,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "คำขอ POA ใหม่", color: "#FFFFFF", weight: "bold", size: "lg", wrap: true },
          { type: "text", text: args.reference, color: "#EDE9FE", size: "sm", wrap: true },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "sm",
            contents: rows,
          },
        ],
      },
    },
  };
}

