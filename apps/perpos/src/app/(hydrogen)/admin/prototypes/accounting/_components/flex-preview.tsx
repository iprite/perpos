/* Flex preview MOCK — hex ตรงตาม line-flex-card-guide §2, LINE render นอกแอป Tailwind ไม่ทำงาน
   → ใช้ hex ตรงได้ (ไม่ใช่ hardcoded-hex violation). ไฟล์นี้ "จำลอง" การ์ด LINE Flex ในหน้าเว็บเท่านั้น
   ไม่ยิง LINE จริง · ใช้ร่วม A3 (ส่งใบแจ้งหนี้) + B6 (hub preview, back agent) */
"use client";

// flex-preview.tsx — เรนเดอร์การ์ด LINE Flex จำลอง (bubble) จาก lineFlexL* data
// แปลง flex JSON (box/text/separator/button) → div เทียบเคียงหน้าตา LINE (header charcoal, body, footer ปุ่ม)
// รองรับ subset ที่ใช้ใน line-mocks: bubble · box(vertical/horizontal) · text · separator · button(uri)
//
// import: import { FlexPreview } from "../_components/flex-preview";

import React from "react";

// ── Flex node types (subset ที่ใช้จริงใน line-mocks) ────────────────────────
type FlexText = {
  type: "text";
  text: string;
  color?: string;
  size?: string;
  weight?: string;
  align?: string;
  flex?: number;
  margin?: string;
  wrap?: boolean;
};
type FlexSeparator = { type: "separator"; color?: string; margin?: string };
type FlexButton = {
  type: "button";
  action: { type: string; label: string; uri?: string };
  style?: string;
  color?: string;
  height?: string;
};
type FlexBox = {
  type: "box";
  layout: string;
  contents: FlexNode[];
  backgroundColor?: string;
  paddingAll?: string;
  cornerRadius?: string;
  spacing?: string;
  margin?: string;
  flex?: number;
  width?: string;
  height?: string;
  justifyContent?: string;
  alignItems?: string;
};
type FlexNode = FlexText | FlexSeparator | FlexButton | FlexBox;

export type FlexBubble = {
  type: "bubble";
  header?: FlexBox;
  body?: FlexBox;
  footer?: FlexBox;
};

/** input type แบบ loose — line-mocks เป็น object literal (string แทน literal union)
 *  รับเข้า FlexPreview ได้โดยไม่ชน type, แล้ว cast เป็น FlexBubble ภายใน */
export type FlexInput = {
  type: string;
  header?: unknown;
  body?: unknown;
  footer?: unknown;
};

// ── size/spacing → px (เทียบ LINE) ──────────────────────────────────────────
const FONT_SIZE: Record<string, string> = {
  xs: "11px",
  sm: "13px",
  md: "15px",
  lg: "18px",
  xl: "21px",
  xxl: "26px",
};
const SPACING: Record<string, string> = {
  none: "0px",
  xs: "2px",
  sm: "4px",
  md: "8px",
  lg: "12px",
  xl: "16px",
  xxl: "20px",
};
function px(v?: string): string | undefined {
  if (!v) return undefined;
  if (v.endsWith("px")) return v;
  return SPACING[v] ?? v;
}

function renderText(node: FlexText, key: React.Key) {
  const align = node.align === "end" ? "right" : node.align === "center" ? "center" : "left";
  return (
    <span
      key={key}
      style={{
        color: node.color ?? "#525866",
        fontSize: FONT_SIZE[node.size ?? "md"] ?? "15px",
        fontWeight: node.weight === "bold" ? 700 : 400,
        textAlign: align as React.CSSProperties["textAlign"],
        flex: node.flex != null ? `${node.flex} ${node.flex} 0%` : undefined,
        marginTop: px(node.margin),
        whiteSpace: node.wrap ? "normal" : "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        lineHeight: 1.35,
      }}
    >
      {node.text}
    </span>
  );
}

function renderSeparator(node: FlexSeparator, key: React.Key) {
  return (
    <div
      key={key}
      style={{
        height: "1px",
        backgroundColor: node.color ?? "#E6E9EE",
        marginTop: px(node.margin),
        marginBottom: px(node.margin),
      }}
    />
  );
}

function renderButton(node: FlexButton, key: React.Key) {
  const isPrimary = node.style === "primary";
  const bg = isPrimary ? (node.color ?? "#3C3B3D") : "#F5F7FA";
  const fg = isPrimary ? "#FFFFFF" : "#3C3B3D";
  return (
    <div
      key={key}
      style={{
        backgroundColor: bg,
        color: fg,
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "13px",
        fontWeight: 600,
        textAlign: "center",
        border: isPrimary ? "none" : "1px solid #E6E9EE",
      }}
    >
      {node.action.label}
    </div>
  );
}

function renderBox(node: FlexBox, key: React.Key) {
  const isH = node.layout === "horizontal";
  return (
    <div
      key={key}
      style={{
        display: "flex",
        flexDirection: isH ? "row" : "column",
        gap: px(node.spacing),
        backgroundColor: node.backgroundColor,
        padding: px(node.paddingAll),
        borderRadius: px(node.cornerRadius),
        marginTop: px(node.margin),
        flex: node.flex != null ? `${node.flex} ${node.flex} 0%` : undefined,
        width: px(node.width),
        height: px(node.height),
        justifyContent: node.justifyContent === "center" ? "center" : undefined,
        alignItems: node.alignItems === "center" ? "center" : isH ? "center" : "stretch",
      }}
    >
      {node.contents.map((c, i) => renderNode(c, i))}
    </div>
  );
}

function renderNode(node: FlexNode, key: React.Key): React.ReactNode {
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "separator":
      return renderSeparator(node, key);
    case "button":
      return renderButton(node, key);
    case "box":
      return renderBox(node, key);
    default:
      return null;
  }
}

/**
 * FlexPreview — เรนเดอร์ bubble จำลองในหน้าเว็บ (กรอบ phone-card)
 * @param flex  flex bubble จาก line-mocks (lineFlexL1..L5)
 * รับ input แบบ loose (line-mocks เป็น object literal — inferred type กว้างกว่า union)
 * แล้ว cast เป็น FlexBubble ภายใน (renderer ตรวจ type/ค่าจริง runtime ผ่าน switch)
 */
export function FlexPreview({ flex: flexInput }: { flex: FlexInput }) {
  const flex = flexInput as unknown as FlexBubble;
  return (
    <div className="flex justify-center">
      <div
        style={{
          width: "300px",
          maxWidth: "100%",
          borderRadius: "14px",
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
          boxShadow: "0 4px 16px rgba(60,59,61,0.12)",
          border: "1px solid #E6E9EE",
        }}
      >
        {flex.header && renderBox(flex.header, "header")}
        {flex.body && renderBox(flex.body, "body")}
        {flex.footer && renderBox(flex.footer, "footer")}
      </div>
    </div>
  );
}
