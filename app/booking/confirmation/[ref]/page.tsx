import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckCircle2, Mail, Calendar, User, Download } from "lucide-react"
import { eq } from "drizzle-orm"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { getDb } from "@/lib/db/client"
import { reservations, customers } from "@/lib/db/schema"
import { formatMoney } from "@/lib/booking/pricing"
import { BookingSteps } from "@/components/booking/booking-steps"
import { ConfirmationStatusBadge } from "@/components/booking/confirmation-status-badge"

export const dynamic = "force-dynamic"

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ ref: string }>
}) {
  const { ref } = await params
  if (!process.env.DATABASE_URL) notFound()
  const db = getDb()
  const rows = await db
    .select({
      id: reservations.id,
      publicRef: reservations.publicRef,
      module: reservations.module,
      status: reservations.status,
      currency: reservations.originalCurrency,
      total: reservations.tndAmount,
      deposit: reservations.depositAmount,
      providerPayload: reservations.providerPayload,
      createdAt: reservations.createdAt,
      customerEmail: customers.email,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
    })
    .from(reservations)
    .leftJoin(customers, eq(reservations.customerId, customers.id))
    .where(eq(reservations.publicRef, ref))
    .limit(1)
  const row = rows[0]
  if (!row) notFound()

  const pl = row.providerPayload as {
    offerLabel?: string
    startDate?: string
    endDate?: string
    adults?: number
    children?: number
  } | null

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-10">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <BookingSteps current={4} />
          <Card className="mt-8 overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-8 text-center">
              <CheckCircle2 className="mx-auto size-14 text-emerald-600" />
              <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
                Réservation confirmée
              </h1>
              <p className="text-muted-foreground mt-1">
                Référence&nbsp;
                <span className="text-foreground font-mono font-semibold">
                  {row.publicRef}
                </span>
              </p>
              <ConfirmationStatusBadge
                publicRef={row.publicRef}
                status={row.status}
              />
            </div>
            <CardContent className="space-y-4 p-6">
              <Detail
                icon={<Calendar className="size-4" />}
                label="Offre"
                value={pl?.offerLabel ?? "—"}
              />
              {pl?.startDate ? (
                <Detail
                  icon={<Calendar className="size-4" />}
                  label="Dates"
                  value={`${formatDate(pl.startDate)}${pl.endDate ? " — " + formatDate(pl.endDate) : ""}`}
                />
              ) : null}
              <Detail
                icon={<User className="size-4" />}
                label="Voyageur"
                value={`${row.customerFirstName ?? ""} ${row.customerLastName ?? ""}`}
              />
              <Detail
                icon={<Mail className="size-4" />}
                label="Email"
                value={row.customerEmail ?? "—"}
              />
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  Montant total
                </span>
                <span className="text-lg font-semibold">
                  {formatMoney(Number(row.total ?? 0))}
                </span>
              </div>
              {row.deposit ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    Acompte demandé
                  </span>
                  <span className="font-medium">
                    {formatMoney(Number(row.deposit))}
                  </span>
                </div>
              ) : null}
              <Separator />
              <p className="text-muted-foreground text-sm">
                Un agent Easy2Book va confirmer votre réservation dans les
                prochaines heures. Vous recevrez un email avec votre voucher
                définitif sur{" "}
                <span className="text-foreground">{row.customerEmail}</span>.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/">Retour à l&apos;accueil</Link>
                </Button>
                <Button className="flex-1" disabled>
                  <Download className="mr-2 size-4" />
                  Télécharger le voucher (bientôt)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}
