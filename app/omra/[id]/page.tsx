/**
 * Détail d'un package Omra — /omra/[id]
 *
 * Route Detail manquante identifiée dans EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md
 * (finding HIGH #4) : `OmraPackageList` liait déjà vers `/omra/${pkg.id}`,
 * mais cette route n'existait pas — chaque clic "Voir le programme" menait
 * à un 404. Catalogue → Détail uniquement ici : aucun nouveau moteur créé.
 *
 * Réservation (Phase 12, Partie 7) : le CTA mène désormais à
 * `/omra/[id]/book`, qui utilise `createGuestOmraBooking`
 * (lib/omra/guest-booking-actions.ts) — un chemin B2C parallèle à
 * `createOmraBooking` (toujours utilisé tel quel pour le B2B) qui ne
 * requiert aucune session partenaire et ne débite jamais le wallet d'une
 * agence. Le contact WhatsApp/téléphone reste disponible en option
 * secondaire pour les demandes hors-ligne.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { and, eq, gte } from "drizzle-orm"
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Phone,
  Plane,
  Hotel as HotelIcon,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { withSystemContext } from "@/lib/db/tenant-context"
import { omraAllotments, omraPackages } from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"

const PACKAGE_TYPE_LABELS: Record<string, string> = {
  omra: "Omra Régulière",
  hajj: "Hajj",
  ramadan: "Omra Ramadan",
  umrah_plus: "Omra + Ziarat",
}

const CONTACT_PHONE = "+21698140514"
const CONTACT_PHONE_DISPLAY = "+216 98 140 514"

function formatDate(d: string | Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getPackageWithDepartures(id: string) {
  if (!UUID_RE.test(id)) return null
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return null
    return await withSystemContext(async (db) => {
      const [pkg] = await db
        .select()
        .from(omraPackages)
        .where(
          and(
            eq(omraPackages.id, id),
            eq(omraPackages.status, "active"),
            eq(omraPackages.agencyId, agencyId),
          ),
        )
        .limit(1)
      if (!pkg) return null

      const departures = await db
        .select()
        .from(omraAllotments)
        .where(
          and(
            eq(omraAllotments.packageId, id),
            eq(omraAllotments.status, "active"),
            gte(omraAllotments.availableCount, 1),
          ),
        )
        .orderBy(omraAllotments.departureDate)

      return { pkg, departures }
    })
  } catch {
    return null
  }
}

export default async function OmraPackageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getPackageWithDepartures(id)
  if (!result) notFound()
  const { pkg, departures } = result

  const label = PACKAGE_TYPE_LABELS[pkg.type] ?? pkg.type
  const priceTnd = pkg.basePrice ? parseFloat(pkg.basePrice) : null

  const inclusions: { label: string; included: boolean }[] = [
    { label: "Visa", included: pkg.includesVisa },
    { label: "Vols", included: pkg.includesFlights },
    { label: "Hôtels", included: pkg.includesHotels },
    { label: "Transferts", included: pkg.includesTransfers },
    { label: "Ziarat (visites religieuses)", included: pkg.includesZiarat },
    { label: "Guide spirituel accompagnateur", included: pkg.includesGuide },
  ]

  const contactMessage = encodeURIComponent(
    `Bonjour, je souhaite des informations sur le package "${pkg.name}".`,
  )

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-emerald-900 to-emerald-700 px-4 py-10 text-white">
          <div className="mx-auto max-w-4xl">
            <Link
              href="/omra"
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-emerald-200 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour aux packages Omra
            </Link>
            <Badge variant="secondary" className="mb-3 bg-white/20 text-white">
              {label}
            </Badge>
            <h1 className="mb-2 text-2xl font-bold md:text-3xl">{pkg.name}</h1>
            {pkg.description && (
              <p className="max-w-2xl text-emerald-100">{pkg.description}</p>
            )}
          </div>
        </div>

        <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 text-lg font-semibold">Ce programme inclut</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {inclusions.map((item) => (
                  <div key={item.label} className="flex items-center gap-2 text-sm">
                    {item.included ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    )}
                    <span className={item.included ? "" : "text-muted-foreground/60"}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm text-muted-foreground sm:grid-cols-4">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {pkg.durationDays} jours
                </div>
                <div className="flex items-center gap-1.5">
                  <Plane className="h-3.5 w-3.5" />
                  Vol {pkg.includesFlights ? "inclus" : "non inclus"}
                </div>
                <div className="flex items-center gap-1.5">
                  <HotelIcon className="h-3.5 w-3.5" />
                  Hôtel {pkg.includesHotels ? "inclus" : "non inclus"}
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {pkg.minPilgrims}–{pkg.maxPilgrims} pèlerins
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Calendar className="h-4.5 w-4.5" />
                Départs disponibles
              </h2>
              {departures.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun départ n&apos;est ouvert à la réservation pour le moment.
                  Contactez-nous pour connaître les prochaines dates.
                </p>
              ) : (
                <ul className="divide-y">
                  {departures.map((d) => {
                    const depPrice = d.overridePrice
                      ? parseFloat(d.overridePrice)
                      : priceTnd
                    return (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                      >
                        <span className="font-medium capitalize">
                          {formatDate(d.departureDate)}
                        </span>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className={
                              d.availableCount > 10
                                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                : "border-amber-300 bg-amber-50 text-amber-700"
                            }
                          >
                            {d.availableCount} place{d.availableCount > 1 ? "s" : ""}
                          </Badge>
                          {depPrice && (
                            <span className="font-semibold text-emerald-700">
                              {depPrice.toLocaleString("fr-FR")} DT
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-4 rounded-xl border bg-card p-5">
              {priceTnd && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground">À partir de</p>
                  <p className="text-3xl font-bold text-emerald-700">
                    {priceTnd.toLocaleString("fr-FR")}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      DT / pèlerin
                    </span>
                  </p>
                </div>
              )}
              {departures.length > 0 ? (
                <>
                  <Button asChild className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800">
                    <Link href={`/omra/${pkg.id}/book`}>Réserver en ligne</Link>
                  </Button>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    ou contactez un conseiller au{" "}
                    <a href={`tel:${CONTACT_PHONE}`} className="font-medium text-emerald-700">
                      {CONTACT_PHONE_DISPLAY}
                    </a>
                  </p>
                </>
              ) : (
                <>
                  <Button asChild className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800">
                    <a href={`https://wa.me/${CONTACT_PHONE.replace("+", "")}?text=${contactMessage}`}>
                      <Phone className="h-4 w-4" />
                      Contacter un conseiller
                    </a>
                  </Button>
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    ou appelez le{" "}
                    <a href={`tel:${CONTACT_PHONE}`} className="font-medium text-emerald-700">
                      {CONTACT_PHONE_DISPLAY}
                    </a>
                  </p>
                </>
              )}
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>
                  Dossier visa, vols et hôtels pris en charge par nos conseillers
                  spécialisés Omra.
                </span>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  )
}
