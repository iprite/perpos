"use client";

import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type WhtPdfData = {
  certificateNo: string;
  whtDate: string;
  payer: { name: string; taxId?: string; address?: string };
  receiver: { name: string; taxId?: string; address?: string };
  category: string;
  ratePct: string;
  baseAmount: string;
  whtAmount: string;
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 11 },
  title: { fontSize: 16, marginBottom: 8 },
  row: { flexDirection: "row", gap: 12 },
  col: { flexGrow: 1 },
  label: { color: "#475569", marginBottom: 2 },
  box: { borderWidth: 1, borderColor: "#CBD5E1", padding: 10, borderRadius: 6 },
  table: { marginTop: 12, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  th: { flex: 1, padding: 8, backgroundColor: "#F1F5F9" },
  td: { flex: 1, padding: 8 },
  right: { textAlign: "right" },
});

export function WhtCertificatePdf(props: { data: WhtPdfData }) {
  const d = props.data;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>ใบรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)</Text>
        <View style={styles.row}>
          <View style={[styles.col, styles.box]}>
            <Text style={styles.label}>เลขที่ใบรับรอง</Text>
            <Text>{d.certificateNo}</Text>
            <Text style={{ marginTop: 6, ...styles.label }}>วันที่</Text>
            <Text>{d.whtDate}</Text>
          </View>
          <View style={[styles.col, styles.box]}>
            <Text style={styles.label}>ประเภท</Text>
            <Text>{d.category}</Text>
            <Text style={{ marginTop: 6, ...styles.label }}>อัตรา WHT</Text>
            <Text>{d.ratePct}</Text>
          </View>
        </View>

        <View style={{ marginTop: 12, ...styles.row }}>
          <View style={[styles.col, styles.box]}>
            <Text style={styles.label}>ผู้หักภาษี (ผู้จ่ายเงิน)</Text>
            <Text>{d.payer.name}</Text>
            <Text style={{ marginTop: 4 }}>เลขผู้เสียภาษี: {d.payer.taxId ?? "-"}</Text>
            <Text style={{ marginTop: 4 }}>ที่อยู่: {d.payer.address ?? "-"}</Text>
          </View>
          <View style={[styles.col, styles.box]}>
            <Text style={styles.label}>ผู้ถูกหักภาษี (ผู้รับเงิน)</Text>
            <Text>{d.receiver.name}</Text>
            <Text style={{ marginTop: 4 }}>เลขผู้เสียภาษี: {d.receiver.taxId ?? "-"}</Text>
            <Text style={{ marginTop: 4 }}>ที่อยู่: {d.receiver.address ?? "-"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={styles.th}>ฐานภาษี</Text>
            <Text style={[styles.th, styles.right]}>ภาษีหัก ณ ที่จ่าย</Text>
          </View>
          <View style={[styles.tr, { borderBottomWidth: 0 }]}>
            <Text style={styles.td}>{d.baseAmount}</Text>
            <Text style={[styles.td, styles.right]}>{d.whtAmount}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

