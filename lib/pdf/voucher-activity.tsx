/**
 * PDF Voucher Attraction — @react-pdf/renderer (Phase 13.1).
 *
 * Même structure que `voucher-package.tsx`/`voucher-omra.tsx`, adaptée à
 * une session (date + horaires) plutôt qu'un départ.
 */

import React from "react"
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer"

export interface ActivityVoucherData {
  publicRef: string
  customerName: string
  activityName: string
  sessionDate: string // YYYY-MM-DD
  sessionStart?: string | null
  sessionEnd?: string | null
  adults: number
  children: number
  totalTnd: number
  agencyName?: string
  agencyPhone?: string
}

const colors = {
  primary: "#0f766e",
  accent: "#059669",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f9fafb",
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1f2937" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: `2px solid ${colors.primary}`,
  },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: colors.primary },
  subtitle: { fontSize: 9, color: colors.muted, marginTop: 2 },
  refBox: { backgroundColor: colors.bg, padding: 10, borderRadius: 4, alignItems: "flex-end" },
  refLabel: { fontSize: 8, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  refValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: colors.primary, marginTop: 2 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    marginBottom: 8,
    marginTop: 20,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  table: { marginTop: 4, border: `1px solid ${colors.border}`, borderRadius: 4 },
  row: { flexDirection: "row", borderBottom: `1px solid ${colors.border}`, minHeight: 28 },
  rowLast: { flexDirection: "row", minHeight: 28 },
  cellLabel: {
    width: "40%",
    padding: 8,
    backgroundColor: colors.bg,
    fontSize: 9,
    color: colors.muted,
    fontFamily: "Helvetica-Bold",
  },
  cellValue: { width: "60%", padding: 8, fontSize: 10 },
  totalRow: {
    flexDirection: "row",
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 4,
    padding: 12,
  },
  totalLabel: { flex: 1, fontSize: 11, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  totalValue: { fontSize: 14, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: `1px solid ${colors.border}`,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: colors.muted },
  stamp: {
    marginTop: 24,
    padding: 12,
    borderRadius: 4,
    border: `2px solid ${colors.accent}`,
    alignSelf: "flex-start",
  },
  stampText: { fontSize: 12, fontFamily: "Helvetica-Bold", color: colors.accent, textTransform: "uppercase" },
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatTnd(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

function ActivityVoucherDocument({ data }: { data: ActivityVoucherData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Easy2Book</Text>
            <Text style={styles.subtitle}>Voucher de Confirmation Attraction</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>N° Réservation</Text>
            <Text style={styles.refValue}>{data.publicRef}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Client</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Nom complet</Text>
            <Text style={styles.cellValue}>{data.customerName}</Text>
          </View>
          <View style={styles.rowLast}>
            <Text style={styles.cellLabel}>Statut</Text>
            <Text style={[styles.cellValue, { color: colors.accent, fontFamily: "Helvetica-Bold" }]}>
              CONFIRMÉ
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Attraction</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Attraction</Text>
            <Text style={[styles.cellValue, { fontFamily: "Helvetica-Bold" }]}>{data.activityName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Date de la session</Text>
            <Text style={styles.cellValue}>{formatDate(data.sessionDate)}</Text>
          </View>
          {(data.sessionStart || data.sessionEnd) && (
            <View style={styles.row}>
              <Text style={styles.cellLabel}>Horaires</Text>
              <Text style={styles.cellValue}>
                {data.sessionStart ?? "—"} – {data.sessionEnd ?? "—"}
              </Text>
            </View>
          )}
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Adultes</Text>
            <Text style={styles.cellValue}>{data.adults}</Text>
          </View>
          {data.children > 0 && (
            <View style={styles.rowLast}>
              <Text style={styles.cellLabel}>Enfants</Text>
              <Text style={styles.cellValue}>{data.children}</Text>
            </View>
          )}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Montant Total TTC</Text>
          <Text style={styles.totalValue}>{formatTnd(data.totalTnd)} DT</Text>
        </View>

        <View style={styles.stamp}>
          <Text style={styles.stampText}>✓ Réservation Confirmée</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.agencyName ?? "Easy2Book"} — {data.agencyPhone ?? "+216 70 000 000"}
          </Text>
          <Text style={styles.footerText}>Généré le {new Date().toLocaleDateString("fr-FR")}</Text>
        </View>
      </Page>
    </Document>
  )
}

export async function renderActivityVoucherPdf(data: ActivityVoucherData): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<ActivityVoucherDocument data={data} />)
  return new Uint8Array(buffer)
}
