/**
 * PDF Voucher Hôtel — @react-pdf/renderer
 *
 * Génère un buffer PDF propre et professionnel pour le voucher
 * d'une réservation d'hôtel confirmée.
 *
 * Usage :
 *   const buffer = await renderVoucherPdf({ ... })
 *   // → Uint8Array prêt pour envoi par email ou stockage
 */

import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface VoucherData {
  publicRef: string
  customerName: string
  hotelName: string
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  nights: number
  adults: number
  children: number
  totalTnd: number
  agencyName?: string
  agencyPhone?: string
}

/* -------------------------------------------------------------------------- */
/* Styles                                                                     */
/* -------------------------------------------------------------------------- */

const colors = {
  primary: "#1e40af", // blue-800
  accent: "#059669", // emerald-600
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f9fafb",
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1f2937",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: `2px solid ${colors.primary}`,
  },
  brand: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
  },
  subtitle: {
    fontSize: 9,
    color: colors.muted,
    marginTop: 2,
  },
  refBox: {
    backgroundColor: colors.bg,
    padding: 10,
    borderRadius: 4,
    alignItems: "flex-end",
  },
  refLabel: {
    fontSize: 8,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  refValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.primary,
    marginBottom: 8,
    marginTop: 20,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  table: {
    marginTop: 4,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
  },
  row: {
    flexDirection: "row",
    borderBottom: `1px solid ${colors.border}`,
    minHeight: 28,
  },
  rowLast: {
    flexDirection: "row",
    minHeight: 28,
  },
  cellLabel: {
    width: "40%",
    padding: 8,
    backgroundColor: colors.bg,
    fontSize: 9,
    color: colors.muted,
    fontFamily: "Helvetica-Bold",
  },
  cellValue: {
    width: "60%",
    padding: 8,
    fontSize: 10,
  },
  totalRow: {
    flexDirection: "row",
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 4,
    padding: 12,
  },
  totalLabel: {
    flex: 1,
    fontSize: 11,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
  },
  totalValue: {
    fontSize: 14,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
  },
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
  footerText: {
    fontSize: 8,
    color: colors.muted,
  },
  stamp: {
    marginTop: 24,
    padding: 12,
    borderRadius: 4,
    border: `2px solid ${colors.accent}`,
    alignSelf: "flex-start",
  },
  stampText: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.accent,
    textTransform: "uppercase",
  },
})

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatTnd(v: number): string {
  return v.toLocaleString("fr-FR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
}

function HotelVoucherDocument({ data }: { data: VoucherData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Easy2Book</Text>
            <Text style={styles.subtitle}>Voucher de Confirmation Hôtel</Text>
          </View>
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>N° Réservation</Text>
            <Text style={styles.refValue}>{data.publicRef}</Text>
          </View>
        </View>

        {/* Guest info */}
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

        {/* Hotel details */}
        <Text style={styles.sectionTitle}>Hébergement</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Hôtel</Text>
            <Text style={[styles.cellValue, { fontFamily: "Helvetica-Bold" }]}>
              {data.hotelName}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Check-in</Text>
            <Text style={styles.cellValue}>{formatDate(data.checkIn)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Check-out</Text>
            <Text style={styles.cellValue}>{formatDate(data.checkOut)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Nuitées</Text>
            <Text style={styles.cellValue}>
              {data.nights} nuit{data.nights > 1 ? "s" : ""}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Adultes</Text>
            <Text style={styles.cellValue}>{data.adults}</Text>
          </View>
          {data.children > 0 && (
            <View style={styles.row}>
              <Text style={styles.cellLabel}>Enfants</Text>
              <Text style={styles.cellValue}>{data.children}</Text>
            </View>
          )}
        </View>

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Montant Total TTC</Text>
          <Text style={styles.totalValue}>{formatTnd(data.totalTnd)} DT</Text>
        </View>

        {/* Confirmed stamp */}
        <View style={styles.stamp}>
          <Text style={styles.stampText}>✓ Réservation Confirmée</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {data.agencyName ?? "Easy2Book"} — {data.agencyPhone ?? "+216 70 000 000"}
          </Text>
          <Text style={styles.footerText}>
            Généré le {new Date().toLocaleDateString("fr-FR")}
          </Text>
        </View>
      </Page>
    </Document>
  )
}

/* -------------------------------------------------------------------------- */
/* Render function                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Rend le document PDF en buffer (Uint8Array).
 * Peut être appelé depuis un Server Action ou une fonction Inngest.
 */
export async function renderVoucherPdf(data: VoucherData): Promise<Uint8Array> {
  const buffer = await renderToBuffer(
    <HotelVoucherDocument data={data} />,
  )
  return new Uint8Array(buffer)
}
