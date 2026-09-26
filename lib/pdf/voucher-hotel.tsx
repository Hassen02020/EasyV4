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
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"
import {
  baseStyles,
  BRAND,
  VoucherHeader,
  VoucherTotal,
  VoucherStamp,
  VoucherFooter,
  VoucherAgencyContact,
} from "./voucher-base"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface VoucherData {
  publicRef: string
  customerName: string
  hotelName: string
  checkIn: string
  checkOut: string
  nights: number
  adults: number
  children: number
  totalTnd: number
  roomType?: string
  boardType?: string
  paymentStatus?: string
  agencyName?: string
  agencyPhone?: string
  agencyEmail?: string
  agencyWebsite?: string
  agencyWhatsapp?: string
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function statusLabel(s?: string): string {
  if (!s || s === "confirmed" || s === "completed") return "CONFIRMÉ"
  if (s === "pending") return "EN ATTENTE"
  if (s === "cancelled") return "ANNULÉ"
  return s.toUpperCase()
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

function HotelVoucherDocument({ data }: { data: VoucherData }) {
  return (
    <Document>
      <Page size="A4" style={baseStyles.page}>
        <VoucherHeader title="Voucher de Confirmation Hôtel" publicRef={data.publicRef} />

        <Text style={baseStyles.sectionTitle}>Client</Text>
        <View style={baseStyles.table}>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Nom complet</Text>
            <Text style={baseStyles.cellValue}>{data.customerName}</Text>
          </View>
          <View style={baseStyles.rowLast}>
            <Text style={baseStyles.cellLabel}>Statut</Text>
            <Text
              style={[
                baseStyles.cellValue,
                { color: BRAND.accent, fontFamily: "Helvetica-Bold" },
              ]}
            >
              {statusLabel(data.paymentStatus)}
            </Text>
          </View>
        </View>

        <Text style={baseStyles.sectionTitle}>Hébergement</Text>
        <View style={baseStyles.table}>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Hôtel</Text>
            <Text style={[baseStyles.cellValue, { fontFamily: "Helvetica-Bold" }]}>
              {data.hotelName}
            </Text>
          </View>
          {data.roomType ? (
            <View style={baseStyles.row}>
              <Text style={baseStyles.cellLabel}>Chambre</Text>
              <Text style={baseStyles.cellValue}>{data.roomType}</Text>
            </View>
          ) : null}
          {data.boardType ? (
            <View style={baseStyles.row}>
              <Text style={baseStyles.cellLabel}>Pension</Text>
              <Text style={baseStyles.cellValue}>{data.boardType}</Text>
            </View>
          ) : null}
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Check-in</Text>
            <Text style={baseStyles.cellValue}>{formatDate(data.checkIn)}</Text>
          </View>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Check-out</Text>
            <Text style={baseStyles.cellValue}>{formatDate(data.checkOut)}</Text>
          </View>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Nuitées</Text>
            <Text style={baseStyles.cellValue}>
              {data.nights} nuit{data.nights > 1 ? "s" : ""}
            </Text>
          </View>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Adultes</Text>
            <Text style={baseStyles.cellValue}>{data.adults}</Text>
          </View>
          {data.children > 0 ? (
            <View style={baseStyles.rowLast}>
              <Text style={baseStyles.cellLabel}>Enfants</Text>
              <Text style={baseStyles.cellValue}>{data.children}</Text>
            </View>
          ) : (
            <View style={baseStyles.rowLast}>
              <Text style={baseStyles.cellLabel}> </Text>
              <Text style={baseStyles.cellValue}> </Text>
            </View>
          )}
        </View>

        <VoucherTotal amount={data.totalTnd} />
        <VoucherStamp />
        <VoucherAgencyContact
          email={data.agencyEmail}
          website={data.agencyWebsite}
          whatsapp={data.agencyWhatsapp}
        />
        <VoucherFooter agencyName={data.agencyName} agencyPhone={data.agencyPhone} />
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
  const buffer = await renderToBuffer(<HotelVoucherDocument data={data} />)
  return new Uint8Array(buffer)
}
