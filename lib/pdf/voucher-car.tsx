/**
 * PDF Voucher Location Voiture — @react-pdf/renderer
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

export interface CarVoucherData {
  publicRef: string
  customerName: string
  categoryName: string
  pickupLocationName: string
  dropoffLocationName: string
  pickupAt: string // ISO datetime
  dropoffAt: string // ISO datetime
  rentalDays: number
  insuranceLevel: string
  totalTnd: number
  agencyName?: string
  agencyPhone?: string
  agencyEmail?: string
  agencyWebsite?: string
  agencyWhatsapp?: string
}

function CarVoucherDocument({
  data,
  locale,
}: {
  data: CarVoucherData
  locale?: string
}) {
  const lb = getVoucherLabels(locale)
  const rtl = isRTL(locale)
  const fontFamily = rtl ? ARABIC_FONT_FAMILY : undefined

  return (
    <Document>
      <Page
        size="A4"
        style={
          rtl
            ? { ...baseStyles.page, fontFamily: ARABIC_FONT_FAMILY }
            : baseStyles.page
        }
      >
        <VoucherHeader
          title={lb.carTitle}
          publicRef={data.publicRef}
          bookingRefLabel={lb.bookingRef}
          rtl={rtl}
        />

        <Text style={getSectionTitleStyle(rtl)}>{lb.clientSection}</Text>
        <View style={baseStyles.table}>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.fullName}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {data.customerName}
            </Text>
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

        <Text style={getSectionTitleStyle(rtl)}>{lb.carSection}</Text>
        <View style={baseStyles.table}>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.vehicleCategory}</Text>
            <Text
              style={{
                ...getCellValueStyle(rtl),
                fontFamily: fontFamily ?? "Helvetica-Bold",
              }}
            >
              {data.categoryName}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.carPickupLocation}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {data.pickupLocationName}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.carDropoffLocation}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {data.dropoffLocationName}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.carPickupAt}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateTimeForLocale(data.pickupAt, locale)}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.carDropoffAt}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateTimeForLocale(data.dropoffAt, locale)}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.rentalDaysLabel}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {lb.rentalDaysText(data.rentalDays)}
            </Text>
          </View>
          <View style={getRowStyle(rtl, true)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.carInsuranceLevel}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {data.insuranceLevel}
            </Text>
          </View>
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

export async function renderCarVoucherPdf(
  data: CarVoucherData,
  locale?: string,
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(
    <CarVoucherDocument data={data} locale={locale} />,
  )
  return new Uint8Array(buffer)
}
