/**
 * PDF Voucher Omra — @react-pdf/renderer
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

export interface OmraVoucherData {
  publicRef: string
  customerName: string
  packageName: string
  departureDate: string // YYYY-MM-DD
  returnDate: string // YYYY-MM-DD
  pilgrimsCount: number
  totalTnd: number
  agencyName?: string
  agencyPhone?: string
}

function OmraVoucherDocument({ data, locale }: { data: OmraVoucherData; locale?: string }) {
  const lb = getVoucherLabels(locale)
  const rtl = isRTL(locale)
  const fontFamily = rtl ? ARABIC_FONT_FAMILY : undefined

  return (
    <Document>
      <Page size="A4" style={rtl ? { ...baseStyles.page, fontFamily: ARABIC_FONT_FAMILY } : baseStyles.page}>
        <VoucherHeader
          title={lb.omraTitle}
          publicRef={data.publicRef}
          bookingRefLabel={lb.bookingRef}
          rtl={rtl}
        />

        <Text style={getSectionTitleStyle(rtl)}>{lb.groupContactSection}</Text>
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

        <Text style={getSectionTitleStyle(rtl)}>{lb.omraProgramSection}</Text>
        <View style={baseStyles.table}>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.packageLabel}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily: fontFamily ?? "Helvetica-Bold" }}>
              {data.packageName}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.departureDate}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateForLocale(data.departureDate, locale)}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.returnDate}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateForLocale(data.returnDate, locale)}
            </Text>
          </View>
          <View style={getRowStyle(rtl, true)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.adults}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {lb.pilgrimsText(data.pilgrimsCount)}
            </Text>
          </View>
        </View>

        <VoucherTotal amount={data.totalTnd} label={lb.totalAmount} rtl={rtl} />
        <VoucherStamp label={lb.confirmedStamp} rtl={rtl} />
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

export async function renderOmraVoucherPdf(data: OmraVoucherData, locale?: string): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<OmraVoucherDocument data={data} locale={locale} />)
  return new Uint8Array(buffer)
}
