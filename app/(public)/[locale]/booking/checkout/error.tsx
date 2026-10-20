"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations("Booking")

  useEffect(() => {
    console.error("[booking/checkout/error.tsx]", error)
  }, [error])

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="bg-destructive/10 mx-auto flex h-14 w-14 items-center justify-center rounded-full">
          <AlertTriangle className="text-destructive h-7 w-7" />
        </div>
        <h1 className="text-foreground mt-4 text-xl font-bold">
          {t("checkoutErrorTitle")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {t("checkoutErrorDesc")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button variant="outline" onClick={() => reset()}>
            {t("retryButton")}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/hotels">{t("relaunchHotelSearch")}</Link>
          </Button>
          <Button asChild>
            <Link href="/">{t("backHome")}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
