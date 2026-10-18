"use client"

/**
 * Formulaire de réservation Network B2C (guest checkout).
 * NETWORK-B2C-01.
 */

import { useState } from "react"
import { useRouter } from "@/i18n/navigation"
import { useTranslations, useLocale } from "next-intl"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, User, CreditCard, Banknote, Package2 } from "lucide-react"
import { createGuestNetworkBooking } from "@/lib/network/guest-booking-actions"
import {
  networkGuestBookingSchema,
  type NetworkGuestBookingInput,
} from "@/lib/network/schemas"
import type { GuestPaymentMethod } from "@/lib/booking/guest-actions"
import { getIntlLocale } from "@/lib/i18n-date"

type AllowedPaymentMethod = "card" | "transfer" | "cash"

interface NetworkProductProps {
  id: string
  name: string
  shortDescription: string | null
  destination: string | null
  stock: number | null
}

interface Props {
  product: NetworkProductProps
  salePriceTnd: number
}

export function NetworkGuestBookingForm({ product, salePriceTnd }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const intlLocale = getIntlLocale(locale)
  const t = useTranslations("Network")
  const tBooking = useTranslations("Booking")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [priceChangedTo, setPriceChangedTo] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] =
    useState<AllowedPaymentMethod>("card")

  const form = useForm<NetworkGuestBookingInput>({
    resolver: zodResolver(
      networkGuestBookingSchema,
    ) as Resolver<NetworkGuestBookingInput>,
    defaultValues: {
      productId: product.id,
      quantity: 1,
      traveler: {
        civility: "M",
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        nationality: "",
        civicIdType: undefined,
        civicId: "",
        birthDate: "",
      },
      policyAccepted: false,
    },
  })

  const quantity = form.watch("quantity") || 1
  const totalTnd = salePriceTnd * quantity
  const displayTotal =
    priceChangedTo != null ? priceChangedTo * quantity : totalTnd

  async function onSubmit(values: NetworkGuestBookingInput) {
    setIsSubmitting(true)
    setPriceChangedTo(null)
    try {
      const result = await createGuestNetworkBooking({
        booking: values,
        paymentMethod: paymentMethod as GuestPaymentMethod,
        expectedTotalTnd: displayTotal,
      })

      if (!result.ok) {
        if (result.code === "PRICE_CHANGED" && result.currentTotalTnd) {
          setPriceChangedTo(result.currentTotalTnd / quantity)
          toast.error(t("priceChangedNotice"))
        } else {
          toast.error(result.error)
        }
        return
      }

      router.push(
        `/voucher?ref=${result.publicRef}&token=${result.guestAccessToken}`,
      )
    } catch {
      toast.error(tBooking("genericError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package2 className="h-4 w-4 text-sky-600" />
            {product.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {product.shortDescription && (
            <p className="text-muted-foreground mb-3 text-sm">
              {product.shortDescription}
            </p>
          )}

          <div className="flex items-center gap-4">
            <Label htmlFor="quantity" className="shrink-0">
              {t("quantity")}
            </Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              max={product.stock ?? 99}
              className="w-24"
              {...form.register("quantity")}
            />
            <input type="hidden" {...form.register("productId")} />
          </div>
          {form.formState.errors.quantity && (
            <p className="mt-1 text-sm text-red-500">
              {form.formState.errors.quantity.message}
            </p>
          )}

          <Separator className="my-4" />

          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">{t("totalLabel")}</span>
            <span className="text-2xl font-bold text-sky-700">
              {displayTotal.toLocaleString(intlLocale)}
              <span className="ml-1 text-sm font-normal">TND</span>
            </span>
          </div>

          {priceChangedTo != null && (
            <Alert className="mt-3 border-amber-200 bg-amber-50">
              <AlertDescription className="text-sm text-amber-800">
                {t("priceChangedNotice")}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4 text-sky-600" />
            {t("contactTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{t("civility")}</Label>
            <Select
              defaultValue="M"
              onValueChange={(v) =>
                form.setValue("traveler.civility", v as "M" | "Mme")
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="M">{t("civilityM")}</SelectItem>
                <SelectItem value="Mme">{t("civilityMme")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">{t("firstName")}</Label>
              <Input
                id="firstName"
                className="mt-1"
                {...form.register("traveler.firstName")}
              />
              {form.formState.errors.traveler?.firstName && (
                <p className="mt-1 text-sm text-red-500">
                  {form.formState.errors.traveler.firstName.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="lastName">{t("lastName")}</Label>
              <Input
                id="lastName"
                className="mt-1"
                {...form.register("traveler.lastName")}
              />
              {form.formState.errors.traveler?.lastName && (
                <p className="mt-1 text-sm text-red-500">
                  {form.formState.errors.traveler.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                className="mt-1"
                {...form.register("traveler.email")}
              />
              {form.formState.errors.traveler?.email && (
                <p className="mt-1 text-sm text-red-500">
                  {form.formState.errors.traveler.email.message}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input
                id="phone"
                type="tel"
                className="mt-1"
                {...form.register("traveler.phone")}
              />
              {form.formState.errors.traveler?.phone && (
                <p className="mt-1 text-sm text-red-500">
                  {form.formState.errors.traveler.phone.message}
                </p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="nationality">{t("nationality")}</Label>
            <Input
              id="nationality"
              className="mt-1"
              {...form.register("traveler.nationality")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-sky-600" />
            {t("paymentTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["card", "transfer", "cash"] as const).map((method) => {
              const isSelected = paymentMethod === method
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors ${
                    isSelected
                      ? "border-sky-600 bg-sky-50 text-sky-700"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {method === "card" ? (
                    <CreditCard className="h-5 w-5" />
                  ) : (
                    <Banknote className="h-5 w-5" />
                  )}
                  {t(`paymentMethod_${method}`)}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-sky-700 hover:bg-sky-800"
        size="lg"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("submitting")}
          </>
        ) : (
          t("confirmBooking")
        )}
      </Button>
    </form>
  )
}
