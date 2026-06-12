"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MapPin, ChevronLeft, AlertTriangle, Phone, Home } from "lucide-react"
import { useLanguageCurrency } from "@/lib/i18n/LanguageCurrencyContext"

interface BookingFormProps {
  hotel: {
    id: number
    name: string
    location: string
    image: string
    roomType: string
    mealPlan: string
    checkIn: string
    checkOut: string
    nights: number
    adults: number
    children: number
    pricePerNight: number
    totalPrice: number
  }
  onBack: () => void
}

interface GuestFormProps {
  guestNumber: number
  isPrimary?: boolean
  type: "adulte" | "enfant"
}

function GuestForm({ guestNumber, isPrimary, type }: GuestFormProps) {
  const { t } = useLanguageCurrency()
  return (
    <div className="border-border grid grid-cols-1 items-end gap-4 border-b py-4 last:border-b-0 md:grid-cols-4">
      <div>
        <span className="text-primary text-sm font-medium">
          {type === "adulte" ? t("booking_form.guest.adult") : t("booking_form.guest.child")} {guestNumber}
          {isPrimary && <span className="block text-xs">{t("booking_form.guest.primary")}</span>}
          <span className="text-destructive"> *</span>
        </span>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={`civilite-${type}-${guestNumber}`}
          className="text-muted-foreground text-sm"
        >
          {t("booking_form.guest.title")} <span className="text-destructive">*</span>
        </Label>
        <Select defaultValue="mr">
          <SelectTrigger
            id={`civilite-${type}-${guestNumber}`}
            className="bg-card"
          >
            <SelectValue placeholder={t("booking_form.guest.select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mr">{t("booking_form.guest.mr")}</SelectItem>
            <SelectItem value="mme">{t("booking_form.guest.mrs")}</SelectItem>
            <SelectItem value="mlle">{t("booking_form.guest.miss")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={`nom-${type}-${guestNumber}`}
          className="text-muted-foreground text-sm"
        >
          {t("booking_form.guest.last_name")} <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`nom-${type}-${guestNumber}`}
          placeholder={t("booking_form.guest.last_name")}
          className="bg-card"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={`prenom-${type}-${guestNumber}`}
          className="text-muted-foreground text-sm"
        >
          {t("booking_form.guest.first_name")} <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`prenom-${type}-${guestNumber}`}
          placeholder={t("booking_form.guest.first_name")}
          className="bg-card"
        />
      </div>
    </div>
  )
}

export function BookingForm({ hotel, onBack }: BookingFormProps) {
  const { t } = useLanguageCurrency()
  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <header className="bg-card border-border sticky top-0 z-50 border-b">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">
                <span className="text-orange-500">Tunisia</span>
                <span className="text-primary">beds</span>
              </h1>
              <nav className="text-muted-foreground ml-8 hidden items-center gap-6 text-sm font-medium md:flex">
                <a href="#" className="hover:text-primary">
                  {t("booking_form.header.home")}
                </a>
                <a href="#" className="hover:text-primary">
                  {t("booking_form.header.hotels")}
                </a>
                <a href="#" className="hover:text-primary">
                  {t("booking_form.header.apartments")}
                </a>
                <a href="#" className="hover:text-primary">
                  {t("booking_form.header.ticket_management")}
                </a>
                <a href="#" className="hover:text-primary">
                  {t("booking_form.header.contact")}
                </a>
              </nav>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <div className="text-primary border-primary flex items-center gap-1 rounded-full border px-3 py-1">
                <Phone className="h-4 w-4" />
              </div>
              <div className="text-right">
                <p className="text-muted-foreground text-xs">
                  {t("booking_form.header.info_reservations")}
                </p>
                <p className="text-primary font-bold">+216 70 163 390</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="bg-card border-border border-b">
        <div className="mx-auto max-w-7xl px-4 py-2">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Home className="h-4 w-4" />
            <span>/</span>
            <button onClick={onBack} className="text-primary hover:underline">
              {t("booking_form.breadcrumb.hotel_list")}
            </button>
            <span>/</span>
            <span className="text-primary">{hotel.name}</span>
            <span>/</span>
            <span>{t("booking_form.breadcrumb.rates")}</span>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="font-medium text-amber-600">
              {t("booking_form.warning.insufficient_balance")}
            </span>
            <span className="text-primary font-medium">
              {t("booking_form.warning.please_fund")}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Left Column - Forms */}
          <div className="flex-1 space-y-6">
            {/* Room Occupancy */}
            <div className="bg-card border-border rounded-lg border p-6">
              <h2 className="text-primary mb-4 text-xl font-bold">
                {t("booking_form.room_occupancy")}
              </h2>

              <div className="mb-4">
                <p className="text-primary font-medium">
                  1. {hotel.roomType} en {hotel.mealPlan}{" "}
                  <span className="text-orange-500">{t("booking_form.on_request")}</span>
                </p>
              </div>

              <div className="space-y-2">
                {Array.from({ length: hotel.adults }).map((_, i) => (
                  <GuestForm
                    key={`adulte-${i}`}
                    guestNumber={i + 1}
                    isPrimary={i === 0}
                    type="adulte"
                  />
                ))}
                {Array.from({ length: hotel.children }).map((_, i) => (
                  <GuestForm
                    key={`enfant-${i}`}
                    guestNumber={i + 1}
                    type="enfant"
                  />
                ))}
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-card border-border rounded-lg border p-6">
              <h2 className="text-primary mb-4 text-xl font-bold">
                {t("booking_form.contact_info")}
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="email"
                    className="text-muted-foreground text-sm"
                  >
                    {t("booking_form.email")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("booking_form.email_placeholder")}
                    className="bg-card"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="telephone"
                    className="text-muted-foreground text-sm"
                  >
                    {t("booking_form.phone")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="telephone"
                    type="tel"
                    placeholder={t("booking_form.phone_placeholder")}
                    className="bg-card"
                  />
                </div>
              </div>
            </div>

            {/* Cancellation Policy */}
            <div className="bg-card border-border rounded-lg border p-6">
              <h2 className="mb-4 text-xl font-bold text-amber-600">
                {t("booking_form.cancellation_policy")}
              </h2>

              <div className="text-muted-foreground space-y-3 text-sm">
                <p>
                  <strong className="text-foreground">
                    {t("booking_form.free_cancellation")}
                  </strong>{" "}
                  {t("booking_form.until_48h")}
                </p>
                <p>
                  {t("booking_form.within_48h")}
                </p>
                <p>
                  {t("booking_form.no_show")}
                </p>
                <p className="text-primary">
                  {t("booking_form.special_requests")}
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <Button variant="outline" onClick={onBack} className="flex-1">
                <ChevronLeft className="mr-2 h-4 w-4" />
                {t("booking_form.back_to_search")}
              </Button>
              <Button className="bg-primary hover:bg-primary/90 flex-1">
                {t("booking_form.book")}
              </Button>
            </div>
          </div>

          {/* Right Column - Booking Summary */}
          <div className="shrink-0 lg:w-80">
            <div className="bg-card border-border sticky top-20 overflow-hidden rounded-lg border">
              {/* Hotel Image */}
              <div
                className="h-48 bg-cover bg-center"
                style={{ backgroundImage: `url(${hotel.image})` }}
              />

              <div className="space-y-4 p-4">
                {/* Hotel Info */}
                <div>
                  <h3 className="text-primary text-lg font-bold">
                    {hotel.name}
                  </h3>
                  <div className="text-muted-foreground mt-1 flex items-center gap-1 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-amber-500" />
                    {hotel.location}
                  </div>
                </div>

                {/* Dates */}
                <div className="text-sm">
                  <p className="text-primary">
                    {t("booking_form.from")}{" "}
                    <span className="text-destructive font-medium">
                      {hotel.checkIn}
                    </span>{" "}
                    {t("booking_form.to")}{" "}
                    <span className="text-destructive font-medium">
                      {hotel.checkOut}
                    </span>
                    , {t("booking_form.so")} {hotel.nights} {t("booking_form.nights")}
                  </p>
                </div>

                {/* Modify Search Link */}
                <button
                  onClick={onBack}
                  className="text-primary flex items-center gap-1 text-sm hover:underline"
                >
                  <ChevronLeft className="h-3 w-3" />
                  <ChevronLeft className="-ml-2 h-3 w-3" />
                  {t("booking_form.modify_search")}
                </button>

                {/* Room Details */}
                <div className="border-border border-t pt-4">
                  <p className="text-foreground font-medium">
                    1. {hotel.roomType} en {hotel.mealPlan}
                  </p>
                  <p className="text-sm text-orange-500">{t("booking_form.on_request")}</p>
                </div>

                {/* Guest Count */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Adultes</span>
                    <span className="font-medium">x{hotel.adults}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Enfants</span>
                    <span className="font-medium">x{hotel.children}</span>
                  </div>
                </div>

                {/* Total */}
                <div className="border-border border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("booking_form.subtotal")}</span>
                    <span className="text-primary text-xl font-bold">
                      {hotel.totalPrice.toLocaleString()}{" "}
                      <span className="text-destructive text-sm font-normal">
                        DT
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
