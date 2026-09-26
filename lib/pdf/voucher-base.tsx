/**
 * Voucher PDF — base partagée entre tous les modules (hôtel, vol, omra, package, activité).
 *
 * Couleurs conformes à l'identité Easy2Book :
 *   primary : #D62828 — Corail Tunisie (oklch 0.55 0.21 25)
 *   sidebar  : #1D3557 — Bleu Méditerranée (oklch 0.3 0.08 250)
 *   accent   : #059669 — Vert confirmation (emerald-600)
 *
 * Police arabe : FreeSerif (local Linux) ou Amiri (CDN).
 * Variable d'environnement ARABIC_FONT_URL pour surcharger en production.
 */

import React from "react"
import { Text, View, StyleSheet, Font } from "@react-pdf/renderer"

export const BRAND = {
  primary: "#D62828",
  sidebar: "#1D3557",
  accent: "#059669",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f9fafb",
}

/* -------------------------------------------------------------------------- */
/* Arabic font registration                                                   */
/* -------------------------------------------------------------------------- */

const ARABIC_FONT_FAMILY = "FreeSerif"

function registerArabicFont() {
  // In production, set ARABIC_FONT_URL to a CDN TTF URL (e.g. Amiri from jsDelivr)
  const src =
    process.env.ARABIC_FONT_URL ??
    "/usr/share/fonts/truetype/freefont/FreeSerif.ttf"
  try {
    Font.register({ family: ARABIC_FONT_FAMILY, src })
  } catch {
    // Non-fatal: fall back to Helvetica for non-Arabic scripts
  }
}

registerArabicFont()

export { ARABIC_FONT_FAMILY }

/* -------------------------------------------------------------------------- */
/* Base styles (LTR)                                                          */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* RTL-aware style helpers                                                    */
/* -------------------------------------------------------------------------- */

export function getPageStyle(rtl: boolean) {
  return rtl
    ? { ...baseStyles.page, fontFamily: ARABIC_FONT_FAMILY }
    : baseStyles.page
}

export function getSectionTitleStyle(rtl: boolean) {
  return rtl
    ? { ...baseStyles.sectionTitle, fontFamily: ARABIC_FONT_FAMILY, textAlign: "right" as const }
    : baseStyles.sectionTitle
}

export function getCellLabelStyle(rtl: boolean) {
  return rtl
    ? { ...baseStyles.cellLabel, fontFamily: ARABIC_FONT_FAMILY, textAlign: "right" as const }
    : baseStyles.cellLabel
}

export function getCellValueStyle(rtl: boolean) {
  return rtl
    ? { ...baseStyles.cellValue, fontFamily: ARABIC_FONT_FAMILY, textAlign: "right" as const }
    : baseStyles.cellValue
}

export function getRowStyle(rtl: boolean, isLast = false) {
  const base = isLast ? baseStyles.rowLast : baseStyles.row
  return rtl ? { ...base, flexDirection: "row-reverse" as const } : base
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function formatTnd(v: number): string {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

/* -------------------------------------------------------------------------- */
/* Shared components — accept translated labels                               */
/* -------------------------------------------------------------------------- */

export function VoucherHeader({
  title,
  publicRef,
  bookingRefLabel = "N° Réservation",
  rtl = false,
}: {
  title: string
  publicRef: string
  bookingRefLabel?: string
  rtl?: boolean
}) {
  const textStyle = rtl ? { fontFamily: ARABIC_FONT_FAMILY } : {}
  return (
    <View style={rtl ? { ...baseStyles.header, flexDirection: "row-reverse" } : baseStyles.header}>
      <View>
        <Text style={{ ...baseStyles.brand, ...textStyle }}>Easy2Book</Text>
        <Text style={{ ...baseStyles.subtitle, ...textStyle }}>{title}</Text>
      </View>
      <View style={[baseStyles.refBox, rtl ? { alignItems: "flex-start" } : {}]}>
        <Text style={{ ...baseStyles.refLabel, ...textStyle }}>{bookingRefLabel}</Text>
        <Text style={{ ...baseStyles.refValue, ...textStyle }}>{publicRef}</Text>
      </View>
    </View>
  )
}

export function VoucherTotal({
  amount,
  label = "Montant Total TTC",
  rtl = false,
}: {
  amount: number
  label?: string
  rtl?: boolean
}) {
  const textStyle = rtl ? { fontFamily: ARABIC_FONT_FAMILY } : {}
  return (
    <View style={rtl ? { ...baseStyles.totalRow, flexDirection: "row-reverse" } : baseStyles.totalRow}>
      <Text style={{ ...baseStyles.totalLabel, ...textStyle }}>{label}</Text>
      <Text style={{ ...baseStyles.totalValue, ...textStyle }}>{formatTnd(amount)} DT</Text>
    </View>
  )
}

export function VoucherStamp({
  label = "✓ Réservation Confirmée",
  rtl = false,
}: {
  label?: string
  rtl?: boolean
}) {
  const textStyle = rtl
    ? { ...baseStyles.stampText, fontFamily: ARABIC_FONT_FAMILY }
    : baseStyles.stampText
  return (
    <View style={baseStyles.stamp}>
      <Text style={textStyle}>{label}</Text>
    </View>
  )
}

export function VoucherFooter({
  agencyName,
  agencyPhone,
  generatedOnLabel = "Généré le",
  rtl = false,
}: {
  agencyName?: string
  agencyPhone?: string
  generatedOnLabel?: string
  rtl?: boolean
}) {
  const textStyle = rtl ? { ...baseStyles.footerText, fontFamily: ARABIC_FONT_FAMILY } : baseStyles.footerText
  return (
    <View style={rtl ? { ...baseStyles.footer, flexDirection: "row-reverse" } : baseStyles.footer}>
      <Text style={textStyle}>
        {agencyName ?? "Easy2Book"} — {agencyPhone ?? "+216 70 000 000"}
      </Text>
      <Text style={textStyle}>
        {generatedOnLabel} {new Date().toLocaleDateString(rtl ? "ar-TN" : "fr-FR")}
      </Text>
    </View>
  )
}

export function VoucherAgencyContact({
  email,
  website,
  whatsapp,
  title = "Contact Agence",
  emailLabel = "Email",
  whatsappLabel = "WhatsApp",
  websiteLabel = "Web",
  rtl = false,
}: {
  email?: string | null
  website?: string | null
  whatsapp?: string | null
  title?: string
  emailLabel?: string
  whatsappLabel?: string
  websiteLabel?: string
  rtl?: boolean
}) {
  if (!email && !website && !whatsapp) return null
  const textStyle = rtl ? { fontFamily: ARABIC_FONT_FAMILY, textAlign: "right" as const } : {}
  return (
    <View style={baseStyles.agencyBox}>
      <Text style={{ ...baseStyles.agencyBoxTitle, ...textStyle }}>{title}</Text>
      {email ? (
        <Text style={{ ...baseStyles.agencyBoxText, ...textStyle }}>{emailLabel} : {email}</Text>
      ) : null}
      {whatsapp ? (
        <Text style={{ ...baseStyles.agencyBoxText, ...textStyle }}>{whatsappLabel} : {whatsapp}</Text>
      ) : null}
      {website ? (
        <Text style={{ ...baseStyles.agencyBoxText, ...textStyle }}>{websiteLabel} : {website}</Text>
      ) : null}
    </View>
  )
}
