/**
 * Fiche programme Omra — /omra/[slug]
 *
 * Le segment accepte un slug OU un id (uuid) pour rester compatible avec
 * les anciens liens `/omra/<id>`.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Check,
  Clock,
  Hotel,
  MapPin,
  MoonStar,
  Phone,
  Plane,
  ShieldCheck,
  Stamp,
  Users,
  Utensils,
  CalendarDays,
} from "lucide-react"
import { and, asc, eq, or } from "drizzle-orm"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDb } from "@/lib/db/client"
import { omraPackages, omraAllotments } from "@/lib/db/schema"
import type { OmraPackage } from "@/lib/db/schema/omra"

export const dynamic = "force-dynamic"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TYPE_LABELS: Record<string, string> = {
  omra: "Omra Régulière",
  hajj: "Hajj",
  ramadan: "Omra Ramadan",
  umrah_plus: "Omra + Ziarat",
}

const FORMULE_LABELS: Record<string, string> = {
  moyasara: "Moyasara",
  al_haram: "Al-Haram",
  abraj_premium: "Abraj Premium",
  vip_exclusive: "VIP Exclusive",
}

const MEAL_LABELS: Record<string, string> = {
  room_only: "Sans repas",
  breakfast: "Petit déjeuner",
  half_board: "Demi-pension",
  full_board: "Pension complète",
  all_inclusive: "Tout inclus",
}

const HOTEL_CATEGORY_STARS: Record<string, number> = {
  economy: 2,
  standard: 3,
  comfort: 4,
  luxury: 5,
  premium: 5,
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

async function getProgram(slugOrId: string): Promise<OmraPackage | null> {
  try {
    const db = getDb()
    const condition = UUID_RE.test(slugOrId)
      ? or(eq(omraPackages.slug, slugOrId), eq(omraPackages.id, slugOrId))
      : eq(omraPackages.slug, slugOrId)
    const rows = await db
      .select()
      .from(omraPackages)
      .where(condition)
      .limit(1)
    return rows[0] ?? null
  } catch {
    return null
  }
}

async function getAllotments(packageId: string) {
  try {
    const db = getDb()
    return await db
      .select()
      .from(omraAllotments)
      .where(
        and(
          eq(omraAllotments.packageId, packageId),
          eq(omraAllotments.status, "active"),
        ),
      )
      .orderBy(asc(omraAllotments.departureDate))
  } catch {
    return []
  }
}

function Stars({ category }: { category: string | null }) {
  if (!category) return null
  const n = HOTEL_CATEGORY_STARS[category] ?? 0
  return (
    <span className="text-amber-500">
      {"★".repeat(n)}
      <span className="text-gray-300">{"★".repeat(5 - n)}</span>
    </span>
  )
}

function HotelBlock({
  city,
  name,
  category,
  nights,
  meal,
}: {
  city: string
  name: string | null
  category: string | null
  nights: number | null
  meal: string | null
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <MapPin className="h-4 w-4 text-emerald-600" />
          {city}
        </p>
        <Stars category={category} />
      </div>
      <p className="flex items-center gap-2 text-lg font-bold">
        <Hotel className="h-4 w-4 text-muted-foreground" />
        {name ?? "Hôtel à confirmer"}
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <MoonStar className="h-4 w-4 text-emerald-600" />
          {nights != null ? `${nights} nuits` : "—"}
        </span>
        {meal ? (
          <span className="flex items-center gap-1.5">
            <Utensils className="h-4 w-4 text-emerald-600" />
            {MEAL_LABELS[meal] ?? meal}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export default async function OmraDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const pkg = await getProgram(slug)
  if (!pkg) notFound()

  const allotments = await getAllotments(pkg.id)
  const priceTnd = pkg.basePrice ? parseFloat(pkg.basePrice) : null
  const formuleLabel = pkg.formule ? FORMULE_LABELS[pkg.formule] : null
  const typeLabel = TYPE_LABELS[pkg.type] ?? pkg.type

  const inclusions = [
    { ok: pkg.includesFlights, icon: Plane, label: "Vols aller-retour" },
    { ok: pkg.includesHotels, icon: Hotel, label: "Hébergement hôtelier" },
    { ok: pkg.includesVisa, icon: Stamp, label: "Visa Omra" },
    { ok: pkg.includesTransfers, icon: MapPin, label: "Transferts" },
    { ok: pkg.includesZiarat, icon: MoonStar, label: "Ziarat (visites)" },
    { ok: pkg.includesGuide, icon: Users, label: "Guide accompagnateur" },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-emerald-800 to-emerald-700 text-white">
          {pkg.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pkg.coverImageUrl}
              alt={pkg.name}
              className="absolute inset-0 h-full w-full object-cover opacity-30"
            />
          ) : null}
          <div className="relative mx-auto max-w-6xl px-4 py-10 md:py-14">
            <Link
              href="/omra"
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-emerald-200 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour aux programmes
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              {formuleLabel ? (
                <Badge className="border-0 bg-amber-400 text-amber-950 hover:bg-amber-400">
                  {formuleLabel}
                </Badge>
              ) : null}
              <Badge
                variant="secondary"
                className="border-0 bg-white/20 text-white hover:bg-white/20"
              >
                {typeLabel}
              </Badge>
            </div>
            <h1 className="mt-3 text-3xl font-bold md:text-4xl">{pkg.name}</h1>
            {pkg.nameAr ? (
              <p dir="rtl" className="mt-1 text-xl text-emerald-200">
                {pkg.nameAr}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-emerald-100">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Programme de {pkg.durationDays} jours
              </span>
              <span className="flex items-center gap-1.5">
                <Plane className="h-4 w-4" />
                Départ de {pkg.departureCity}
              </span>
              {pkg.alternativeDurations && pkg.alternativeDurations.length > 0 ? (
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  Aussi en {pkg.alternativeDurations.join(", ")} nuits
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[1fr_340px]">
          {/* Contenu principal */}
          <div className="space-y-10">
            {pkg.description ? (
              <section>
                <h2 className="mb-3 text-2xl font-bold">Présentation</h2>
                <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
                  {pkg.description}
                </p>
              </section>
            ) : null}

            {/* Points forts */}
            {pkg.highlights && pkg.highlights.length > 0 ? (
              <section>
                <h2 className="mb-3 text-2xl font-bold">Points forts</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {pkg.highlights.map((h, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Hébergement */}
            <section>
              <h2 className="mb-4 text-2xl font-bold">Hébergement</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <HotelBlock
                  city="Médine"
                  name={pkg.hotelMedinaName}
                  category={pkg.hotelMedinaCategory}
                  nights={pkg.nightsMedina}
                  meal={pkg.mealPlanMedina}
                />
                <HotelBlock
                  city="La Mecque"
                  name={pkg.hotelMakkahName}
                  category={pkg.hotelMakkahCategory}
                  nights={pkg.nightsMakkah}
                  meal={pkg.mealPlanMakkah}
                />
              </div>
            </section>

            {/* Itinéraire */}
            {pkg.itinerary && pkg.itinerary.length > 0 ? (
              <section>
                <h2 className="mb-4 text-2xl font-bold">Programme jour par jour</h2>
                <ol className="space-y-4">
                  {pkg.itinerary.map((d) => (
                    <li key={d.day} className="flex gap-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                        {d.day}
                      </div>
                      <div className="pt-1">
                        <p className="font-semibold">{d.title}</p>
                        {d.description ? (
                          <p className="text-sm text-muted-foreground">
                            {d.description}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {/* Inclusions */}
            <section>
              <h2 className="mb-4 text-2xl font-bold">Ce qui est inclus</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {inclusions.map((inc) => (
                  <div
                    key={inc.label}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                      inc.ok
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-dashed bg-muted/30 text-muted-foreground line-through"
                    }`}
                  >
                    <inc.icon
                      className={`h-4 w-4 ${inc.ok ? "text-emerald-600" : "text-gray-400"}`}
                    />
                    {inc.label}
                  </div>
                ))}
              </div>
            </section>

            {/* Dates & prix */}
            <section id="dates" className="scroll-mt-24">
              <h2 className="mb-4 text-2xl font-bold">Dates & prix</h2>
              {allotments.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Départ</th>
                        <th className="px-4 py-3 font-medium">Places dispo.</th>
                        <th className="px-4 py-3 text-right font-medium">
                          Prix / pers
                        </th>
                        <th className="px-4 py-3 text-right font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {allotments.map((a) => (
                        <tr key={a.id} className="border-b last:border-0">
                          <td className="px-4 py-3 font-medium">
                            {fmtDate(a.departureDate)}
                          </td>
                          <td className="px-4 py-3">
                            {a.availableCount > 0 ? (
                              <span className="text-emerald-700">
                                {a.availableCount} places
                              </span>
                            ) : (
                              <span className="text-red-600">Complet</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {fmtPrice(a.overridePrice ?? pkg.basePrice)} TND
                          </td>
                          <td className="px-4 py-3 text-right">
                            {a.availableCount > 0 ? (
                              <Button
                                asChild
                                size="sm"
                                className="bg-emerald-700 hover:bg-emerald-800"
                              >
                                <Link
                                  href={`/omra/${pkg.slug ?? pkg.id}/reserver`}
                                >
                                  Réserver
                                </Link>
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
                  Les dates de départ seront publiées prochainement. Contactez
                  nos conseillers pour connaître les disponibilités.
                </p>
              )}
            </section>

            {/* Photos */}
            {pkg.photoUrls && pkg.photoUrls.length > 0 ? (
              <section>
                <h2 className="mb-4 text-2xl font-bold">Photos</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {pkg.photoUrls.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`${pkg.name} — photo ${i + 1}`}
                      className="aspect-video w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          {/* Sidebar prix / CTA */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <p className="text-sm text-muted-foreground">à partir de</p>
              <p className="text-emerald-700">
                <span className="text-4xl font-bold">{fmtPrice(priceTnd)}</span>
                <span className="ml-1 text-base font-medium">TND / pers</span>
              </p>
              {pkg.allowsInstallments ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Facilités de paiement disponibles
                </p>
              ) : null}

              <div className="my-5 space-y-2 border-y py-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Durée</span>
                  <span className="font-medium">{pkg.durationDays} jours</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Médine</span>
                  <span className="font-medium">
                    {pkg.nightsMedina != null ? `${pkg.nightsMedina} nuits` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">La Mecque</span>
                  <span className="font-medium">
                    {pkg.nightsMakkah != null ? `${pkg.nightsMakkah} nuits` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Validité</span>
                  <span className="font-medium">
                    {fmtDate(pkg.validFrom)}
                  </span>
                </div>
              </div>

              <Link
                href={`/omra/${pkg.slug ?? pkg.id}/reserver`}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-800"
              >
                <CalendarDays className="h-4 w-4" />
                Réserver ce programme
              </Link>
              <Button variant="outline" className="mt-3 w-full" asChild>
                <a href="tel:+21698140514">
                  <Phone className="h-4 w-4" />
                  Parler à un conseiller
                </a>
              </Button>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Réservation sécurisée · Agence agréée
              </p>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  )
}
