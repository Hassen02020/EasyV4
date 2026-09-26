/**
 * PDF Voucher Vol — @react-pdf/renderer
 *
 * Même structure que `voucher-hotel.tsx`, adaptée à un billet de vol
 * (PNR + segment au lieu de dates de séjour).
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

export interface FlightVoucherData {
  publicRef: string
  customerName: string
  pnr: string | null
  origin: string
  destination: string
  departAt: string
  arriveAt: string | null
  carrier: string | null
  flightNumber: string | null
  cabinClass: string | null
  adults: number
  children: number
  totalTnd: number
  agencyName?: string
  agencyPhone?: string
  agencyEmail?: string
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function FlightVoucherDocument({ data }: { data: FlightVoucherData }) {
  return (
    <Document>
      <Page size="A4" style={baseStyles.page}>
        <VoucherHeader title="Voucher de Confirmation Vol" publicRef={data.publicRef} />

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
              CONFIRMÉ
            </Text>
          </View>
        </View>

        <Text style={baseStyles.sectionTitle}>Vol</Text>
        <View style={baseStyles.table}>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Trajet</Text>
            <Text style={[baseStyles.cellValue, { fontFamily: "Helvetica-Bold" }]}>
              {data.origin} → {data.destination}
            </Text>
          </View>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>PNR</Text>
            <Text style={baseStyles.cellValue}>{data.pnr ?? "—"}</Text>
          </View>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Vol</Text>
            <Text style={baseStyles.cellValue}>
              {data.carrier ?? "—"} {data.flightNumber ?? ""}
            </Text>
          </View>
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Départ</Text>
            <Text style={baseStyles.cellValue}>{formatDateTime(data.departAt)}</Text>
          </View>
          {data.arriveAt ? (
            <View style={baseStyles.row}>
              <Text style={baseStyles.cellLabel}>Arrivée</Text>
              <Text style={baseStyles.cellValue}>{formatDateTime(data.arriveAt)}</Text>
            </View>
          ) : null}
          <View style={baseStyles.row}>
            <Text style={baseStyles.cellLabel}>Cabine</Text>
            <Text style={baseStyles.cellValue}>{data.cabinClass ?? "ECONOMY"}</Text>
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
        <VoucherAgencyContact email={data.agencyEmail} />
        <VoucherFooter agencyName={data.agencyName} agencyPhone={data.agencyPhone} />
      </Page>
    </Document>
  )
}

export async function renderFlightVoucherPdf(data: FlightVoucherData): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<FlightVoucherDocument data={data} />)
  return new Uint8Array(buffer)
}
