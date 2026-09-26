/**
 * PDF Voucher Attraction — @react-pdf/renderer
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

function ActivityVoucherDocument({ data, locale }: { data: ActivityVoucherData; locale?: string }) {
  const lb = getVoucherLabels(locale)
  const rtl = isRTL(locale)
  const fontFamily = rtl ? ARABIC_FONT_FAMILY : undefined

  return (
    <Document>
      <Page size="A4" style={rtl ? { ...baseStyles.page, fontFamily: ARABIC_FONT_FAMILY } : baseStyles.page}>
        <VoucherHeader
          title={lb.activityTitle}
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

        <Text style={getSectionTitleStyle(rtl)}>{lb.activitySection}</Text>
        <View style={baseStyles.table}>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.activityLabel}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily: fontFamily ?? "Helvetica-Bold" }}>
              {data.activityName}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.sessionDate}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateForLocale(data.sessionDate, locale)}
            </Text>
          </View>
          {(data.sessionStart || data.sessionEnd) ? (
            <View style={getRowStyle(rtl)}>
              <Text style={getCellLabelStyle(rtl)}>{lb.schedule}</Text>
              <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
                {data.sessionStart ?? "—"} – {data.sessionEnd ?? "—"}
              </Text>
            </View>
          ) : null}
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.adults}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>{data.adults}</Text>
          </View>
          {data.children > 0 ? (
            <View style={getRowStyle(rtl, true)}>
              <Text style={getCellLabelStyle(rtl)}>{lb.children}</Text>
              <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>{data.children}</Text>
            </View>
          ) : null}
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

export async function renderActivityVoucherPdf(data: ActivityVoucherData, locale?: string): Promise<Uint8Array> {
  const buffer = await renderToBuffer(<ActivityVoucherDocument data={data} locale={locale} />)
  return new Uint8Array(buffer)
}
