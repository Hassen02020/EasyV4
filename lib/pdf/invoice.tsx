/**
 * PDF Facture — @react-pdf/renderer (Phase 21.2, P1).
 *
 * Même moteur/style que `lib/pdf/voucher-hotel.tsx` (rendu à la demande,
 * jamais stocké) — étend le même principe à la facture : jusqu'ici
 * `generateInvoiceForReservation` (lib/finance/invoice-actions.ts) écrivait
 * un enregistrement financier réel (`partnerInvoices`) mais aucun PDF
 * n'existait (`generateInvoicePDF` legacy était du code mort qui levait
 * toujours une exception, jsPDF jamais installé).
 *
 * Générique, pas hôtel-spécifique : `generateInvoiceForReservation`
 * fonctionne déjà pour tous les modules (hôtel/omra/package/activity/
 * transfer/car) à partir des mêmes champs (`reservations.tndAmount`,
 * `providerPayload.offerLabel`) — un seul rendu PDF suffit, pas un par
 * module comme pour le voucher (qui affiche des détails spécifiques :
 * dates de séjour, nuitées...).
 *
 * Le résumé de paiement (collected/remaining/état) est TOUJOURS recalculé
 * via `getReservationPaymentSummary()` par l'appelant (jamais ici) —
 * jamais une seconde source de vérité financière.
 */

import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"

export interface InvoiceData {
  invoiceNumber: string
  publicRef: string
  validationDate: string // YYYY-MM-DD
  customerName: string
  customerEmail?: string
  agencyName: string
  agencyMatriculeFiscale?: string
  agencyAddress?: string
  label: string
  totalHt: number
  totalTva: number
  totalTtc: number
  collectedTnd: number
  remainingTnd: number
  paymentState: "UNPAID" | "PARTIALLY_PAID" | "FULLY_PAID"
}

const colors = {
  primary: "#1e40af",
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
  cellLabel: { width: "40%", padding: 8, backgroundColor: colors.bg, fontSize: 9, color: colors.muted, fontFamily: "Helvetica-Bold" },
  cellValue: { width: "60%", padding: 8, fontSize: 10 },
  totalsBox: { marginTop: 16, alignSelf: "flex-end", width: "50%" },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalsLabel: { fontSize: 9, color: colors.muted },
  totalsValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 4,
    padding: 12,
  },
  grandTotalLabel: { fontSize: 11, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  grandTotalValue: { fontSize: 14, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  paymentBox: { marginTop: 16, padding: 12, borderRadius: 4, border: `2px solid ${colors.accent}` },
  paymentBoxUnpaid: { marginTop: 16, padding: 12, borderRadius: 4, border: `2px solid #b45309` },
  paymentText: { fontSize: 11, fontFamily: "Helvetica-Bold", color: colors.accent, textTransform: "uppercase" },
  paymentTextUnpaid: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#b45309", textTransform: "uppercase" },
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
})

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

function formatTnd(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

const PAYMENT_STATE_LABEL: Record<InvoiceData["paymentState"], string> = {
  UNPAID: "Non réglée",
  PARTIALLY_PAID: "Partiellement réglée",
  FULLY_PAID: "Réglée intégralement",
}

function InvoiceDocument({ data }: { data: InvoiceData }) {
  const isFullyPaid = data.paymentState === "FULLY_PAID"
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>{data.agencyName}</Text>
            <Text style={styles.subtitle}>Facture</Text>
            {data.agencyMatriculeFiscale ? (
              <Text style={styles.subtitle}>MF : {data.agencyMatriculeFiscale}</Text>
            ) : null}
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>N° Facture</Text>
            <Text style={styles.refValue}>{data.invoiceNumber}</Text>
            <Text style={[styles.refLabel, { marginTop: 6 }]}>Réservation</Text>
            <Text style={styles.footerText}>{data.publicRef}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Client</Text>
        <View style={styles.table}>
          <View style={data.customerEmail ? styles.row : styles.rowLast}>
            <Text style={styles.cellLabel}>Nom complet</Text>
            <Text style={styles.cellValue}>{data.customerName}</Text>
          </View>
          {data.customerEmail ? (
            <View style={styles.rowLast}>
              <Text style={styles.cellLabel}>Email</Text>
              <Text style={styles.cellValue}>{data.customerEmail}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Prestation</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Désignation</Text>
            <Text style={styles.cellValue}>{data.label}</Text>
          </View>
          <View style={styles.rowLast}>
            <Text style={styles.cellLabel}>Date</Text>
            <Text style={styles.cellValue}>{formatDate(data.validationDate)}</Text>
          </View>
        </View>

        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total HT</Text>
            <Text style={styles.totalsValue}>{formatTnd(data.totalHt)} DT</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>TVA</Text>
            <Text style={styles.totalsValue}>{formatTnd(data.totalTva)} DT</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total TTC</Text>
            <Text style={styles.grandTotalValue}>{formatTnd(data.totalTtc)} DT</Text>
          </View>
        </View>

        <View style={isFullyPaid ? styles.paymentBox : styles.paymentBoxUnpaid}>
          <Text style={isFullyPaid ? styles.paymentText : styles.paymentTextUnpaid}>
            {PAYMENT_STATE_LABEL[data.paymentState]}
          </Text>
          <Text style={{ fontSize: 9, marginTop: 4, color: colors.muted }}>
            Encaissé : {formatTnd(data.collectedTnd)} DT — Restant : {formatTnd(data.remainingTnd)} DT
          </Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{data.agencyAddress ?? data.agencyName}</Text>
          <Text style={styles.footerText}>Généré le {new Date().toLocaleDateString("fr-FR")}</Text>
        </View>
      </Page>
    </Document>
  )
}

/** Rend la facture en buffer PDF (Uint8Array) — pure/déterministe pour les mêmes données. */
export async function renderInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<InvoiceDocument data={data} />)
  return new Uint8Array(buffer)
}
