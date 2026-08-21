/**
 * Détail d'un voyage organisé — /packages/[slug]
 *
 * Route Detail manquante identifiée dans EASYV4_SEARCH_ENGINES_AUDIT_REPORT.md
 * (finding HIGH #5) : `PackageList` liait déjà vers `/packages/${pkg.slug}`,
 * mais cette route n'existait pas — chaque clic "Voir le programme" menait
 * à un 404. Catalogue → Détail uniquement ici : aucun nouveau moteur créé.
 *
 * Réservation : contrairement à Omra, il n'existe ICI AUCUN moteur de
 * réservation, ni B2C ni B2B (aucun `createPackageBooking`, confirmé par
 * recherche dans tout `lib/`) — construire ce moteur est explicitement hors
 * périmètre de cette phase ("ne pas créer de nouveaux moteurs"). Le CTA
 * redirige donc vers un contact réel plutôt que de simuler un flux de
 * paiement inexistant. Documenté comme gap pour une phase dédiée.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import Image from "next/image"
import { and, eq, gte } from "drizzle-orm"
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Globe,
  MapPin,
  Phone,
  Plane,
  Users,
  X,
} from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogPackageDepartures, catalogPackages } from "@/lib/db/schema"

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

interface ItineraryDay {
  day: number
  title: string
  description: string
}

function parseItinerary(raw: unknown): ItineraryDay[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (d): d is ItineraryDay =>
      typeof d === "object" &&
      d !== null &&
      typeof (d as ItineraryDay).day === "number" &&
      typeof (d as ItineraryDay).title === "string",
  )
}

async function getPackageWithDepartures(slug: string) {
  try {
    return await withSystemContext(async (db) => {
      const [pkg] = await db
        .select()
        .from(catalogPackages)
        .where(and(eq(catalogPackages.slug, slug), eq(catalogPackages.status, "active")))
        .limit(1)
      if (!pkg) return null

      const departuresRaw = await db
        .select()
        .from(catalogPackageDepartures)
        .where(
          and(
            eq(catalogPackageDepartures.packageId, pkg.id),
            eq(catalogPackageDepartures.status, "open"),
            gte(catalogPackageDepartures.departureDate, new Date().toISOString().split("T")[0]!),
          ),
        )
        .orderBy(catalogPackageDepartures.departureDate)

      // "Aucune disponibilité inventée" : on ne montre que les départs avec
      // des places réellement libres, calculées ici plutôt que stockées.
      const departures = departuresRaw
        .map((d) => ({ ...d, seatsLeft: d.totalSeats - d.bookedSeats }))
        .filter((d) => d.seatsLeft > 0)

      return { pkg, departures }
    })
  } catch {
    return null
  }
}

export default async function PackageDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const result = await getPackageWithDepartures(slug)
  if (!result) notFound()
  const { pkg, departures } = result

  const itinerary = parseItinerary(pkg.itinerary)
  const contactMessage = encodeURIComponent(
    `Bonjour, je souhaite des informations sur le voyage "${pkg.title}".`,
  )

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="relative h-64 w-full bg-muted md:h-80">
          {pkg.coverImage ? (
            <Image
              src={pkg.coverImage}
              alt={pkg.title}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-900 to-violet-700">
              <Globe className="h-16 w-16 text-white/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-4 pb-6">
            <div className="mx-auto max-w-4xl">
              <Link
                href="/packages"
                className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour aux voyages organisés
              </Link>
              <p className="mb-1 text-xs font-medium tracking-widest text-violet-300 uppercase">
                {pkg.code}
              </p>
              <h1 className="text-2xl font-bold text-white md:text-3xl">{pkg.title}</h1>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-4xl gap-6 px-4 py-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {pkg.longDescription && (
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-3 text-lg font-semibold">Description</h2>
                <p className="whitespace-pre-line text-sm text-muted-foreground">
                  {pkg.longDescription}
                </p>
              </section>
            )}

            {(pkg.inclusions?.length || pkg.exclusions?.length) && (
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-lg font-semibold">Inclus / Non inclus</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {pkg.inclusions && pkg.inclusions.length > 0 && (
                    <ul className="space-y-1.5 text-sm">
                      {pkg.inclusions.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                  {pkg.exclusions && pkg.exclusions.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {pkg.exclusions.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {itinerary.length > 0 && (
              <section className="rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-lg font-semibold">Itinéraire</h2>
                <ol className="space-y-4">
                  {itinerary.map((day) => (
                    <li key={day.day} className="flex gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                        {day.day}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{day.title}</p>
                        {day.description && (
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {day.description}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Calendar className="h-4.5 w-4.5" />
                Prochains départs
              </h2>
              {departures.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun départ n&apos;est ouvert à la réservation pour le moment.
                  Contactez-nous pour connaître les prochaines dates.
                </p>
              ) : (
                <ul className="divide-y">
                  {departures.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <div>
                        <span className="font-medium capitalize">
                          {formatDate(d.departureDate)}
                        </span>
                        <span className="text-muted-foreground"> → {formatDate(d.returnDate)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant="outline"
                          className={
                            d.seatsLeft > 5
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-amber-300 bg-amber-50 text-amber-700"
                          }
                        >
                          {d.seatsLeft} place{d.seatsLeft > 1 ? "s" : ""}
                        </Badge>
                        <span className="font-semibold text-violet-700">
                          {parseFloat(d.adultPriceTnd).toLocaleString("fr-FR")} DT
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="lg:col-span-1">
            <div className="sticky top-4 rounded-xl border bg-card p-5">
              <div className="mb-4 grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                {pkg.durationDays && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {pkg.durationDays}J / {pkg.durationNights ?? pkg.durationDays - 1}N
                  </div>
                )}
                {pkg.transportMode && (
                  <div className="flex items-center gap-1.5">
                    <Plane className="h-3.5 w-3.5" />
                    {pkg.transportMode}
                  </div>
                )}
                {pkg.departureLocations && pkg.departureLocations.length > 0 && (
                  <div className="col-span-2 flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Départ : {pkg.departureLocations.join(", ")}
                  </div>
                )}
              </div>

              {departures[0] && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground">À partir de</p>
                  <p className="text-3xl font-bold text-violet-700">
                    {parseFloat(departures[0].adultPriceTnd).toLocaleString("fr-FR")}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      DT / adulte
                    </span>
                  </p>
                  {departures[0].childPriceTnd && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {parseFloat(departures[0].childPriceTnd).toLocaleString("fr-FR")} DT / enfant
                    </p>
                  )}
                </div>
              )}

              {/* Aucun moteur de réservation Packages n'existe (ni B2C, ni
                  B2B) — voir le commentaire de tête de ce fichier. */}
              <Button asChild className="w-full gap-2 bg-violet-700 hover:bg-violet-800">
                <a href={`https://wa.me/${CONTACT_PHONE.replace("+", "")}?text=${contactMessage}`}>
                  <Phone className="h-4 w-4" />
                  Réserver — contacter un conseiller
                </a>
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                ou appelez le{" "}
                <a href={`tel:${CONTACT_PHONE}`} className="font-medium text-violet-700">
                  {CONTACT_PHONE_DISPLAY}
                </a>
              </p>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  )
}
