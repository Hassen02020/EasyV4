/**
 * Voucher PDF — base partagée entre tous les modules (hôtel, vol, omra, package, activité).
 *
 * Couleurs conformes à l'identité Easy2Book :
 *   primary : #D62828 — Corail Tunisie (oklch 0.55 0.21 25)
 *   sidebar  : #1D3557 — Bleu Méditerranée (oklch 0.3 0.08 250)
 *   accent   : #059669 — Vert confirmation (emerald-600)
 */

import React from "react"
import { Text, View, StyleSheet } from "@react-pdf/renderer"

export const BRAND = {
  primary: "#D62828",
  sidebar: "#1D3557",
  accent: "#059669",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f9fafb",
}

export const baseStyles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1f2937" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: `2px solid ${BRAND.primary}`,
  },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND.primary },
  subtitle: { fontSize: 9, color: BRAND.muted, marginTop: 2 },
  refBox: { backgroundColor: BRAND.bg, padding: 10, borderRadius: 4, alignItems: "flex-end" },
  refLabel: { fontSize: 8, color: BRAND.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  refValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: BRAND.primary, marginTop: 2 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: BRAND.primary,
    marginBottom: 8,
    marginTop: 20,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  table: { marginTop: 4, border: `1px solid ${BRAND.border}`, borderRadius: 4 },
  row: { flexDirection: "row", borderBottom: `1px solid ${BRAND.border}`, minHeight: 28 },
  rowLast: { flexDirection: "row", minHeight: 28 },
  cellLabel: {
    width: "40%",
    padding: 8,
    backgroundColor: BRAND.bg,
    fontSize: 9,
    color: BRAND.muted,
    fontFamily: "Helvetica-Bold",
  },
  cellValue: { width: "60%", padding: 8, fontSize: 10 },
  totalRow: {
    flexDirection: "row",
    marginTop: 16,
    backgroundColor: BRAND.primary,
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
    borderTop: `1px solid ${BRAND.border}`,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: BRAND.muted },
  stamp: {
    marginTop: 24,
    padding: 12,
    borderRadius: 4,
    border: `2px solid ${BRAND.accent}`,
    alignSelf: "flex-start",
  },
  stampText: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: BRAND.accent,
    textTransform: "uppercase",
  },
  agencyBox: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#eff6ff",
    borderRadius: 4,
  },
  agencyBoxTitle: {
    fontSize: 9,
    color: BRAND.muted,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  agencyBoxText: { fontSize: 9, color: "#1f2937", marginTop: 2 },
})

export function formatTnd(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export function VoucherHeader({ title, publicRef }: { title: string; publicRef: string }) {
  return (
    <View style={baseStyles.header}>
      <View>
        <Text style={baseStyles.brand}>Easy2Book</Text>
        <Text style={baseStyles.subtitle}>{title}</Text>
      </View>
      <View style={baseStyles.refBox}>
        <Text style={baseStyles.refLabel}>N° Réservation</Text>
        <Text style={baseStyles.refValue}>{publicRef}</Text>
      </View>
    </View>
  )
}

export function VoucherTotal({ amount }: { amount: number }) {
  return (
    <View style={baseStyles.totalRow}>
      <Text style={baseStyles.totalLabel}>Montant Total TTC</Text>
      <Text style={baseStyles.totalValue}>{formatTnd(amount)} DT</Text>
    </View>
  )
}

export function VoucherStamp({ label = "✓ Réservation Confirmée" }: { label?: string }) {
  return (
    <View style={baseStyles.stamp}>
      <Text style={baseStyles.stampText}>{label}</Text>
    </View>
  )
}

export function VoucherFooter({
  agencyName,
  agencyPhone,
}: {
  agencyName?: string
  agencyPhone?: string
}) {
  return (
    <View style={baseStyles.footer}>
      <Text style={baseStyles.footerText}>
        {agencyName ?? "Easy2Book"} — {agencyPhone ?? "+216 70 000 000"}
      </Text>
      <Text style={baseStyles.footerText}>
        Généré le {new Date().toLocaleDateString("fr-FR")}
      </Text>
    </View>
  )
}

export function VoucherAgencyContact({
  email,
  website,
  whatsapp,
}: {
  email?: string | null
  website?: string | null
  whatsapp?: string | null
}) {
  if (!email && !website && !whatsapp) return null
  return (
    <View style={baseStyles.agencyBox}>
      <Text style={baseStyles.agencyBoxTitle}>Contact Agence</Text>
      {email ? <Text style={baseStyles.agencyBoxText}>Email : {email}</Text> : null}
      {whatsapp ? <Text style={baseStyles.agencyBoxText}>WhatsApp : {whatsapp}</Text> : null}
      {website ? <Text style={baseStyles.agencyBoxText}>Web : {website}</Text> : null}
    </View>
  )
}
