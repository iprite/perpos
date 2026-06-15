"use client";

import React from "react";
import { Document, Page, StyleSheet, Text, View, Font } from "@react-pdf/renderer";

// ── Font: Noto Sans Thai เท่านั้น (static TTF จาก jsDelivr — มี CORS, react-pdf อ่านได้) ──
Font.register({
  family: "NotoSansThai",
  fonts: [
    { src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSansThai/NotoSansThai-Regular.ttf" },
    { src: "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts/hinted/ttf/NotoSansThai/NotoSansThai-Bold.ttf", fontWeight: "bold" },
  ],
});
// กันการตัดคำไทยกลางคำ (react-pdf จะไม่ hyphenate)
Font.registerHyphenationCallback((word) => [word]);

export type MomPdfData = {
  meetingTitle: string;
  fileName: string;
  dateText: string;
  executiveSummary: string;
  speakers: string[];
  keyTopics: { topic: string; details: string }[];
  decisions: string[];
  actionItems: { task: string; assignee: string; deadline: string }[];
};

const PRIMARY = "#533afd";
const INK = "#111827";
const INK_SUB = "#6b7280";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 44, fontFamily: "NotoSansThai", fontSize: 10.5, color: INK, lineHeight: 1.5 },

  // header
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  brand: { fontSize: 9, letterSpacing: 1, color: PRIMARY, fontWeight: "bold" },
  docKind: { fontSize: 9, color: INK_SUB },
  accent: { height: 3, backgroundColor: PRIMARY, borderRadius: 2, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },

  metaBox: { flexDirection: "row", flexWrap: "wrap", gap: 4, borderWidth: 1, borderColor: BORDER, borderRadius: 6, padding: 10, marginBottom: 16, backgroundColor: "#f9fafb" },
  metaItem: { width: "50%", flexDirection: "row", marginBottom: 2 },
  metaLabel: { color: INK_SUB, width: 70 },
  metaVal: { flex: 1 },

  section: { marginBottom: 14 },
  h2: { fontSize: 12, fontWeight: "bold", color: PRIMARY, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: BORDER },

  summaryBox: { borderWidth: 1, borderColor: "#e0e7ff", backgroundColor: "#eef2ff", borderRadius: 6, padding: 10 },

  listItem: { flexDirection: "row", marginBottom: 6 },
  num: { width: 18, fontWeight: "bold", color: PRIMARY },
  itemBody: { flex: 1 },
  topicName: { fontWeight: "bold" },
  topicDetail: { color: "#374151", marginTop: 1 },

  bullet: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 12, color: PRIMARY },

  // action table
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: "hidden" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
  trLast: { flexDirection: "row" },
  thRow: { backgroundColor: PRIMARY },
  th: { color: "#ffffff", fontWeight: "bold", padding: 6, fontSize: 9.5 },
  td: { padding: 6, fontSize: 10 },
  cNo: { width: "8%", textAlign: "center" },
  cTask: { width: "50%" },
  cAssignee: { width: "24%" },
  cDue: { width: "18%" },
  zebra: { backgroundColor: "#f9fafb" },
  emptyRow: { padding: 8, color: INK_SUB, textAlign: "center", fontSize: 10 },

  footer: { position: "absolute", bottom: 24, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 6, color: INK_SUB, fontSize: 8 },
});

export function MomPdf({ data }: { data: MomPdfData }) {
  const d = data;
  return (
    <Document title={d.meetingTitle || "รายงานการประชุม"}>
      <Page size="A4" style={styles.page}>
        {/* header */}
        <View style={styles.brandRow}>
          <Text style={styles.brand}>PERPOS</Text>
          <Text style={styles.docKind}>รายงานการประชุม · Minutes of Meeting</Text>
        </View>
        <View style={styles.accent} />

        <Text style={styles.title}>{d.meetingTitle || "รายงานการประชุม"}</Text>

        <View style={styles.metaBox}>
          <View style={styles.metaItem}><Text style={styles.metaLabel}>วันที่จัดทำ</Text><Text style={styles.metaVal}>{d.dateText}</Text></View>
          <View style={styles.metaItem}><Text style={styles.metaLabel}>ผู้เข้าร่วม</Text><Text style={styles.metaVal}>{d.speakers.length ? `${d.speakers.length} คน` : "—"}</Text></View>
          <View style={styles.metaItem}><Text style={styles.metaLabel}>ไฟล์ต้นทาง</Text><Text style={styles.metaVal}>{d.fileName}</Text></View>
          <View style={styles.metaItem}><Text style={styles.metaLabel}>รายชื่อ</Text><Text style={styles.metaVal}>{d.speakers.length ? d.speakers.join(", ") : "—"}</Text></View>
        </View>

        {/* executive summary */}
        {d.executiveSummary ? (
          <View style={styles.section}>
            <Text style={styles.h2}>บทสรุปผู้บริหาร</Text>
            <View style={styles.summaryBox}><Text>{d.executiveSummary}</Text></View>
          </View>
        ) : null}

        {/* key topics */}
        {d.keyTopics.length ? (
          <View style={styles.section}>
            <Text style={styles.h2}>ประเด็นที่หารือ</Text>
            {d.keyTopics.map((k, i) => (
              <View key={i} style={styles.listItem} wrap={false}>
                <Text style={styles.num}>{i + 1}.</Text>
                <View style={styles.itemBody}>
                  <Text style={styles.topicName}>{k.topic}</Text>
                  {k.details ? <Text style={styles.topicDetail}>{k.details}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* decisions */}
        {d.decisions.length ? (
          <View style={styles.section}>
            <Text style={styles.h2}>มติ / ข้อสรุปที่ประชุม</Text>
            {d.decisions.map((dec, i) => (
              <View key={i} style={styles.bullet} wrap={false}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.itemBody}>{dec}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* action items table */}
        <View style={styles.section}>
          <Text style={styles.h2}>ตารางสรุปสิ่งที่ต้องดำเนินการ (Action Items)</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.thRow]} wrap={false}>
              <Text style={[styles.th, styles.cNo]}>#</Text>
              <Text style={[styles.th, styles.cTask]}>สิ่งที่ต้องดำเนินการ</Text>
              <Text style={[styles.th, styles.cAssignee]}>ผู้รับผิดชอบ</Text>
              <Text style={[styles.th, styles.cDue]}>กำหนดส่ง</Text>
            </View>
            {d.actionItems.length ? (
              d.actionItems.map((a, i) => {
                const last = i === d.actionItems.length - 1;
                return (
                  <View key={i} style={[last ? styles.trLast : styles.tr, i % 2 === 1 ? styles.zebra : {}]} wrap={false}>
                    <Text style={[styles.td, styles.cNo]}>{i + 1}</Text>
                    <Text style={[styles.td, styles.cTask]}>{a.task}</Text>
                    <Text style={[styles.td, styles.cAssignee]}>{a.assignee || "—"}</Text>
                    <Text style={[styles.td, styles.cDue]}>{a.deadline || "—"}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyRow}>— ไม่มีรายการที่ต้องดำเนินการ —</Text>
            )}
          </View>
        </View>

        {/* footer */}
        <View style={styles.footer} fixed>
          <Text>จัดทำโดยระบบ PERPOS Assistant</Text>
          <Text render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
