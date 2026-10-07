import { notFound, redirect } from "next/navigation"
import { getLocale } from "next-intl/server"
import { and, eq } from "drizzle-orm"
import { Download, Calendar, User, FileText, ArrowLeft } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { withSystemContext } from "@/lib/db/tenant-context"
import { reservations, customers } from "@/lib/db/schema"
import {
  voucherHrefForModule,
  VOUCHER_ROUTE_BY_MODULE,
} from "@/lib/pro/voucher-eligibility"
import { getIntlLocale } from "@/lib/i18n-date"
import { ConfirmationStatusBadge } from "@/components/booking/confirmation-status-badge"

export const dynamic = "force-dynamic"

/** Modules connus avec leur libellé lisible. */
const MODULE_LABELS: Record<string, string> = {
  hotel: "Hôtel",
  hotel_monde: "Hôtel International",
  omra: "Omra",
  package: "Voyage Organisé",
  activity: "Activité",
  flight: "Vol",
  car: "Location de voiture",
  transfer: "Transfert",
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(getIntlLocale(locale), {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

export default async function VoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string; locale: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { ref } = await params
  const { token } = await searchParams

  if (!process.env.DATABASE_URL) notFound()

  // Même invariant sécurité que la page confirmation (Phase 21.1 / TG-2026-000123) :
  // publicRef seul est séquentiel/devinable — le guestAccessToken est OBLIGATOIRE.
  // Sans token : renvoyer vers la confirmation (l'utilisateur a forcément ce lien).
  if (!token) redirect(`/booking/confirmation/${ref}`)

  const row = await withSystemContext(async (db) => {
    const rows = await db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        module: reservations.module,
        status: reservations.status,
        providerPayload: reservations.providerPayload,
        createdAt: reservations.createdAt,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        customerEmail: customers.email,
      })
      .from(reservations)
      .leftJoin(customers, eq(reservations.customerId, customers.id))
      .where(
        and(
          eq(reservations.publicRef, ref),
          eq(reservations.guestAccessToken, token),
        ),
      )
      .limit(1)
    return rows[0] ?? null
  })

  if (!row) notFound()

  const locale = await getLocale()

  const pl = row.providerPayload as {
    offerLabel?: string
    startDate?: string
    endDate?: string
    adults?: number
    children?: number
  } | null

  const isVoucherEligible =
    (row.status === "confirmed" || row.status === "completed") &&
    row.module in VOUCHER_ROUTE_BY_MODULE

  const voucherHref = isVoucherEligible
    ? voucherHrefForModule(row.module, row.publicRef, token, locale)
    : null

  const confirmationHref = `/booking/confirmation/${row.publicRef}?token=${token}`

  const travelerName =
    [row.customerFirstName, row.customerLastName].filter(Boolean).join(" ") ||
    "—"

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-10">
        <div className="mx-auto max-w-lg px-4 sm:px-6">
          {/* Back link */}
          <Link
            href={confirmationHref}
            className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" />
            Retour à la confirmation
          </Link>

          <Card className="overflow-hidden">
            {/* Header */}
            <CardHeader className="bg-muted/40 border-b pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="text-primary size-5" />
                    Bon de voyage
                  </CardTitle>
                  <p className="text-muted-foreground mt-1 font-mono text-sm">
                    {row.publicRef}
                  </p>
                </div>
                <ConfirmationStatusBadge
                  publicRef={row.publicRef}
                  status={row.status}
                />
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-6">
              {/* Module */}
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Produit</span>
                <span className="font-medium">
                  {MODULE_LABELS[row.module] ?? row.module}
                </span>
              </div>

              {/* Offer label */}
              {pl?.offerLabel && (
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    Offre
                  </span>
                  <span className="max-w-[60%] text-right font-medium">
                    {pl.offerLabel}
                  </span>
                </div>
              )}

              {/* Dates */}
              {pl?.startDate && (
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    Dates
                  </span>
                  <span className="font-medium">
                    {formatDate(pl.startDate, locale)}
                    {pl.endDate ? ` — ${formatDate(pl.endDate, locale)}` : ""}
                  </span>
                </div>
              )}

              {/* Traveler */}
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground inline-flex items-center gap-1.5">
                  <User className="size-3.5" />
                  Voyageur
                </span>
                <span className="font-medium">{travelerName}</span>
              </div>

              <Separator />

              {/* Download or unavailable */}
              {voucherHref ? (
                <Button asChild className="w-full">
                  <a
                    href={voucherHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download className="mr-2 size-4" />
                    Télécharger le bon de voyage (PDF)
                  </a>
                </Button>
              ) : (
                <div className="space-y-3">
                  <Button className="w-full" disabled>
                    <Download className="mr-2 size-4" />
                    Bon disponible après confirmation
                  </Button>
                  <p className="text-muted-foreground text-center text-xs">
                    Le bon de voyage sera disponible une fois la réservation
                    confirmée par l&apos;agence.
                  </p>
                </div>
              )}

              <Button asChild variant="outline" className="w-full">
                <Link href={confirmationHref}>
                  <ArrowLeft className="mr-2 size-4" />
                  Voir la confirmation complète
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  )
}
