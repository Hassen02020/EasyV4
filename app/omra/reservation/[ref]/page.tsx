/**
 * Page de confirmation de réservation Omra B2C — /omra/reservation/[ref]
 *
 * Affiche le récapitulatif d'une réservation publique (référence, programme,
 * date de départ, pèlerins, montant) après soumission du tunnel.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarDays, CheckCircle2, Phone, Users } from "lucide-react"
import { and, asc, eq } from "drizzle-orm"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDb } from "@/lib/db/client"
import {
  reservations,
  reservationOmra,
  omraPackages,
  omraPilgrims,
} from "@/lib/db/schema"
import { B2C_DEFAULT_AGENCY_ID } from "@/lib/omra/b2c-booking-shared"

export const dynamic = "force-dynamic"

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente de confirmation",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  completed: "Terminée",
}

function fmtDate(d: string | Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function fmtPrice(v: string | number | null): string {
  if (v == null) return "—"
  return Number(v).toLocaleString("fr-FR")
}

async function getReservation(ref: string) {
  try {
    const db = getDb()
    const [res] = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.publicRef, ref),
          eq(reservations.agencyId, B2C_DEFAULT_AGENCY_ID),
          eq(reservations.module, "omra"),
        ),
      )
      .limit(1)

    if (!res) return null

    const [ext] = await db
      .select()
      .from(reservationOmra)
      .where(eq(reservationOmra.reservationId, res.id))
      .limit(1)

    const pilgrims = await db
      .select({
        firstName: omraPilgrims.firstName,
        lastName: omraPilgrims.lastName,
        passportNumber: omraPilgrims.passportNumber,
      })
      .from(omraPilgrims)
      .where(eq(omraPilgrims.reservationId, res.id))
      .orderBy(asc(omraPilgrims.createdAt))

    let pkg = null
    if (ext) {
      const [p] = await db
        .select()
        .from(omraPackages)
        .where(eq(omraPackages.id, ext.omraPackageId))
        .limit(1)
      pkg = p ?? null
    }

    return { res, ext: ext ?? null, pilgrims, pkg }
  } catch {
    return null
  }
}

export default async function OmraReservationPage({
  params,
}: {
  params: Promise<{ ref: string }>
}) {
  const { ref } = await params
  const data = await getReservation(ref)
  if (!data) notFound()

  const { res, ext, pilgrims, pkg } = data

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto max-w-3xl flex-1 px-4 py-10">
        <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-600" />
          <h1 className="text-2xl font-bold">Réservation enregistrée</h1>
          <p className="mt-2 text-muted-foreground">
            Merci ! Votre demande de réservation Omra a bien été reçue. Un
            conseiller Easy2Book vous recontacte pour finaliser le paiement.
          </p>
          <div className="mt-4 inline-flex flex-col items-center gap-1">
            <span className="text-sm text-muted-foreground">
              Référence de réservation
            </span>
            <span className="rounded-lg bg-emerald-50 px-4 py-2 text-xl font-bold tracking-wide text-emerald-800">
              {res.publicRef}
            </span>
            <Badge variant="outline" className="mt-2">
              {STATUS_LABELS[res.status] ?? res.status}
            </Badge>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {pkg ? (
            <div className="rounded-xl border bg-card p-6">
              <h2 className="mb-3 font-bold">{pkg.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-emerald-600" />
                  <span className="text-muted-foreground">Départ :</span>
                  <span className="font-medium">
                    {fmtDate(ext?.departureDate ?? null)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="h-4 w-4 text-emerald-600" />
                  <span className="text-muted-foreground">Retour :</span>
                  <span className="font-medium">
                    {fmtDate(ext?.returnDate ?? null)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-emerald-600" />
                  <span className="text-muted-foreground">Pèlerins :</span>
                  <span className="font-medium">{pilgrims.length}</span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border bg-card p-6">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <Users className="h-4 w-4 text-emerald-600" />
              Pèlerins
            </h2>
            <ul className="divide-y">
              {pilgrims.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-medium">
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-muted-foreground">
                    Passeport {p.passportNumber}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between rounded-xl border bg-emerald-50 p-6">
            <span className="font-medium text-emerald-900">Montant total</span>
            <span className="text-2xl font-bold text-emerald-800">
              {fmtPrice(res.tndAmount)}{" "}
              <span className="text-base font-medium">TND</span>
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="flex-1 bg-emerald-700 hover:bg-emerald-800">
            <a href="tel:+21698140514">
              <Phone className="mr-2 h-4 w-4" />
              Contacter un conseiller
            </a>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/omra">Voir d&apos;autres programmes</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  )
}
