/**
 * PDF Voucher Transfert (VOUCHER-CAR-TRANSFER-DATA-01, lot "transfer") — @react-pdf/renderer
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
import { TRANSFER_TIME_ZONE } from "@/lib/transfers/pickup-at"

export interface TransferVoucherData {
  publicRef: string
  customerName: string
  fromZone: string
  toZone: string
  pickupAt: string // ISO datetime (instant UTC, affiché en heure de Tunis)
  vehicleType: string
  totalTnd: number
  agencyName?: string
  agencyPhone?: string
  agencyEmail?: string
  agencyWebsite?: string
  agencyWhatsapp?: string
}

function TransferVoucherDocument({
  data,
  locale,
}: {
  data: TransferVoucherData
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
          title={lb.transferTitle}
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

        <Text style={getSectionTitleStyle(rtl)}>{lb.transferSection}</Text>
        <View style={baseStyles.table}>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.transferFrom}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {data.fromZone}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.transferTo}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {data.toZone}
            </Text>
          </View>
          <View style={getRowStyle(rtl)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.transferPickupAt}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {formatDateTimeForLocale(
                data.pickupAt,
                locale,
                TRANSFER_TIME_ZONE,
              )}
            </Text>
          </View>
          <View style={getRowStyle(rtl, true)}>
            <Text style={getCellLabelStyle(rtl)}>{lb.transferVehicle}</Text>
            <Text style={{ ...getCellValueStyle(rtl), fontFamily }}>
              {lb.transferVehicleLabel(data.vehicleType)}
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

export async function renderTransferVoucherPdf(
  data: TransferVoucherData,
  locale?: string,
): Promise<Uint8Array> {
  const buffer = await renderToBuffer(
    <TransferVoucherDocument data={data} locale={locale} />,
  )
  return new Uint8Array(buffer)
}
