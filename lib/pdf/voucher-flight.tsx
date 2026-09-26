/**
 * PDF Voucher Vol — @react-pdf/renderer
 * Supporte FR / EN / AR (RTL).
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
  getSectionTitleStyle,
  getCellLabelStyle,
  getCellValueStyle,
  getRowStyle,
  ARABIC_FONT_FAMILY,
} from "./voucher-base"
import {
  getVoucherLabels,
  isRTL,
  formatDateTimeForLocale,
} from "./voucher-i18n"

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

function FlightVoucherDocument({ data, locale }: { data: FlightVoucherData; locale?: string }) {
  const lb = getVoucherLabels(locale)
  const rtl = isRTL(locale)
  const fontFamily = rtl ? ARABIC_FONT_FAMILY : undefined

  return (
    <Document>
      <Page size="A4" style={rtl ? { ...baseStyles.page, fontFamily: ARABIC_FONT_FAMILY } : baseStyles.page}>
        <VoucherHeader
          title={lb.flightTitle}
          publicRef={data.publicRef}
          bookingRefLabel={lb.bookingRef}
          rtl={rtl}
        />

        <Text style={getSectionTitleStyle(rtl)}>{lb.clientSection}</Text>
        <View style={baseStyles.table}>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.fullName}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>{data.customerName}</Text>
          </View>
          <View style={getRowStyle(rtl, true)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.status}</Text>
            <Text
              style={{
                ...getCellValueStyle(rtl),
                color: BRAND.accent,
                fontFamily: fontFamily ?? "Helvetica-Bold",
              }}
            >
              {lb.statusConfirmed}
            </Text>
          </View>
        </View>

        <Text style={getSectionTitleStyle(rtl)}>{lb.flightSection}</Text>
        <View style={baseStyles.table}>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.route}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily: fontFamily ?? "Helvetica-Bold" }}>
              {data.origin} → {data.destination}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.pnr}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>{data.pnr ?? "—"}</Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.flightNumber}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {data.carrier ?? "—"} {data.flightNumber ?? ""}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.departure}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateTimeForLocale(data.departAt, locale)}
            </Text>
          </View>
          {data.arriveAt ? (
            <View style={getRowStyle(rtl)}>
              <Text style={getCellLabelStyle(rtl)}>{lb.arrival}</Text>
              <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
                {formatDateTimeForLocale(data.arriveAt, locale)}
              </Text>
            </View>
          ) : null}
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.cabin}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {data.cabinClass ?? "ECONOMY"}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.adults}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>{data.adults}</Text>
          </View>
          {data.children > 0 ? (
            <View style={getRowStyle(rtl, true)}>
              <Text style={getCellLabelStyle(rtl)}>{lb.children}</Text>
              <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>{data.children}</Text>
            </View>
          ) : (
            <View style={getRowStyle(rtl, true)}>
              <Text style={getCellLabelStyle(rtl)}> </Text>
              <Text style={getCellValueStyle(rtl)}> </Text>
            </View>
          )}
        </View>

        <VoucherTotal amount={data.totalTnd} label={lb.totalAmount} rtl={rtl} />
        <VoucherStamp label={lb.confirmedStamp} rtl={rtl} />
        <VoucherAgencyContact
          email={data.agencyEmail}
          title={lb.agencyContactTitle}
          emailLabel={lb.emailLabel}
          whatsappLabel={lb.whatsappLabel}
          websiteLabel={lb.websiteLabel}
          rtl={rtl}
        />
        <VoucherFooter
          agencyName={data.agencyName}
          agencyPhone={data.agencyPhone}
          generatedOnLabel={lb.generatedOn}
          rtl={rtl}
        />
      </Page>
    </Document>
  )
}

export async function renderFlightVoucherPdf(data: FlightVoucherData, locale?: string): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<FlightVoucherDocument data={data} locale={locale} />)
  return new Uint8Array(buffer)
}
