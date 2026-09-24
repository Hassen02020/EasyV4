/**
 * /vols/confirmation/[publicRef]
 *
 * Post-booking confirmation page. The publicRef (e.g. TG-2026-000042) comes
 * from the booking action result; the page reads the reservation from the
 * Booking Core (reservations table) for display.
 *
 * Security: no price or supplier details are shown — only the human-readable
 * reference, status, and SLA notice. The guestAccessToken is not in the URL
 * (it was only returned from the action to the client for potential voucher
 * deep-links in future iterations).
 */

import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations } from "@/lib/db/schema"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "@/i18n/navigation"
import { Button } from "@/components/ui/button"
import { CheckCircle, Clock, Plane } from "lucide-react"

interface Props {
  params: Promise<{ publicRef: string; locale: string }>
}

export default async function ConfirmationPage({ params }: Props) {
  const { publicRef } = await params
  const t = await getTranslations("Vols")

  const rows = await withSystemContext((tx) =>
    tx
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        status: reservations.status,
        createdAt: reservations.createdAt,
      })
      .from(reservations)
      .where(eq(reservations.publicRef, publicRef))
      .limit(1),
  )

  const reservation = (rows as Array<{ id: string; publicRef: string; status: string; createdAt: Date }>)[0]
  if (!reservation) notFound()

  const createdAtDisplay = reservation.createdAt
    ? new Date(reservation.createdAt).toLocaleString("fr-TN", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : ""

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle className="h-14 w-14 text-sky-600" />
          <h1 className="text-2xl font-bold">{t("finalizeBookingTitle")}</h1>
          <p className="text-muted-foreground text-sm">
            Votre demande de billet a bien été enregistrée.
          </p>
        </div>

        <Card className="w-full">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plane className="h-4 w-4 text-sky-700" />
              {t("summaryTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Référence</span>
              <span className="font-mono font-semibold text-sky-700">{reservation.publicRef}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Statut</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 capitalize">
                {reservation.status}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Demande enregistrée le</span>
              <span>{createdAtDisplay}</span>
            </div>
          </CardContent>
        </Card>

        <div className="bg-sky-50 border-sky-200 flex items-start gap-3 rounded-lg border p-4 text-sm">
          <Clock className="text-sky-600 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sky-900">
            Notre équipe billetterie va traiter votre demande dans les <strong>15 minutes</strong>.
            Vous recevrez votre e-ticket par email dès confirmation.
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/vols">{t("backToSearch")}</Link>
        </Button>
      </main>
      <Footer />
    </div>
  )
}
