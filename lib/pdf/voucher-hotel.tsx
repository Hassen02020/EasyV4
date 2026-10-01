/**
 * PDF Voucher Hôtel — @react-pdf/renderer
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
  formatDateForLocale,
} from "./voucher-i18n"

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

function statusLabel(s: string | undefined, labels: ReturnType<typeof getVoucherLabels>): string {
  if (!s || s === "confirmed" || s === "completed") return labels.statusConfirmed
  if (s === "pending") return labels.statusPending
  if (s === "cancelled") return labels.statusCancelled
  return s.toUpperCase()
}

function HotelVoucherDocument({ data, locale }: { data: VoucherData; locale?: string }) {
  const lb = getVoucherLabels(locale)
  const rtl = isRTL(locale)
  const fontFamily = rtl ? ARABIC_FONT_FAMILY : undefined

  return (
    <Document>
      <Page size="A4" style={rtl ? { ...baseStyles.page, fontFamily: ARABIC_FONT_FAMILY } : baseStyles.page}>
        <VoucherHeader
          title={lb.hotelTitle}
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
              {statusLabel(data.paymentStatus, lb)}
            </Text>
          </View>
        </View>

        <Text style={getSectionTitleStyle(rtl)}>{lb.accommodationSection}</Text>
        <View style={baseStyles.table}>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.hotel}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily: fontFamily ?? "Helvetica-Bold" }}>
              {data.hotelName}
            </Text>
          </View>
          {data.roomType ? (
            <View style={getRowStyle(rtl)}>
              <Text style={getCellLabelStyle(rtl)}>{lb.room}</Text>
              <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>{data.roomType}</Text>
            </View>
          ) : null}
          {data.boardType ? (
            <View style={getRowStyle(rtl)}>
              <Text style={getCellLabelStyle(rtl)}>{lb.board}</Text>
              <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>{data.boardType}</Text>
            </View>
          ) : null}
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.checkIn}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateForLocale(data.checkIn, locale)}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.checkOut}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateForLocale(data.checkOut, locale)}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.nightsLabel}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {lb.nightsText(data.nights)}
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
          website={data.agencyWebsite}
          whatsapp={data.agencyWhatsapp}
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

export async function renderVoucherPdf(data: VoucherData, locale?: string): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<HotelVoucherDocument data={data} locale={locale} />)
  return new Uint8Array(buffer)
}
