"use client"

import Link from "next/link"
import {
  Star,
  Hotel,
  Clock,
  ChevronRight,
  Check,
  MoonStar,
  CalendarDays,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { OmraPackage } from "@/lib/db/schema/omra"

interface Props {
  packages: OmraPackage[]
}

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

function hrefFor(pkg: OmraPackage): string {
  return `/omra/${pkg.slug ?? pkg.id}`
}

function CityNights({
  city,
  nights,
  meal,
  hotel,
}: {
  city: string
  nights: number | null
  meal: string | null
  hotel: string | null
}) {
  return (
    <div className="rounded-lg bg-emerald-50 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
          <MoonStar className="h-3.5 w-3.5" />
          {nights != null ? `${nights} nuits` : "—"}
        </span>
        <span className="text-xs font-medium text-emerald-700">{city}</span>
      </div>
      {hotel ? (
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-emerald-700/80">
          <Hotel className="h-3 w-3 shrink-0" />
          {hotel}
        </p>
      ) : null}
      {meal ? (
        <p className="text-[11px] text-emerald-600/80">
          {MEAL_LABELS[meal] ?? meal}
        </p>
      ) : null}
    </div>
  )
}

function PackageCard({ pkg }: { pkg: OmraPackage }) {
  const typeLabel = TYPE_LABELS[pkg.type] ?? pkg.type
  const formuleLabel = pkg.formule ? FORMULE_LABELS[pkg.formule] : null
  const priceTnd = pkg.basePrice ? parseFloat(pkg.basePrice) : null
  const highlights = (pkg.highlights ?? []).slice(0, 4)

  return (
    <Card className="flex flex-col overflow-hidden pt-0 transition-shadow hover:shadow-lg">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-emerald-800 to-emerald-600 p-5 text-white">
        <div className="mb-2 flex flex-wrap items-center gap-2">
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
        <h3 className="text-lg leading-tight font-bold">{pkg.name}</h3>
        {pkg.nameAr ? (
          <p dir="rtl" className="mt-0.5 text-sm text-emerald-200">
            {pkg.nameAr}
          </p>
        ) : null}
        <p className="mt-2 flex items-center gap-3 text-xs text-emerald-100">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {pkg.durationDays} jours
          </span>
          {pkg.alternativeDurations && pkg.alternativeDurations.length > 0 ? (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Aussi en {pkg.alternativeDurations.join(", ")} nuits
            </span>
          ) : null}
        </p>
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 px-5">
        {/* Nuits Médine / Makkah */}
        <div className="grid grid-cols-2 gap-2">
          <CityNights
            city="Médine"
            nights={pkg.nightsMedina}
            meal={pkg.mealPlanMedina}
            hotel={pkg.hotelMedinaName}
          />
          <CityNights
            city="La Mecque"
            nights={pkg.nightsMakkah}
            meal={pkg.mealPlanMakkah}
            hotel={pkg.hotelMakkahName}
          />
        </div>

        {/* Points forts */}
        {highlights.length > 0 ? (
          <ul className="space-y-1.5">
            {highlights.map((h, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span className="line-clamp-1">{h}</span>
              </li>
            ))}
          </ul>
        ) : pkg.description ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">
            {pkg.description}
          </p>
        ) : null}

        {/* Prix */}
        {priceTnd != null ? (
          <div className="mt-auto border-t pt-3">
            <p className="text-xs text-muted-foreground">à partir de</p>
            <p className="text-emerald-700">
              <span className="text-2xl font-bold">
                {priceTnd.toLocaleString("fr-FR")}
              </span>
              <span className="ml-1 text-sm font-medium">TND / pers</span>
            </p>
            {pkg.allowsInstallments ? (
              <p className="text-[11px] text-muted-foreground">
                Facilités de paiement disponibles
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex gap-2 border-t px-4">
        <Button
          variant="outline"
          className="flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          asChild
        >
          <Link href={`${hrefFor(pkg)}#dates`}>Dates & prix</Link>
        </Button>
        <Button
          className="flex-1 gap-1 bg-emerald-700 hover:bg-emerald-800"
          asChild
        >
          <Link href={hrefFor(pkg)}>
            Le programme
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function OmraPackageList({ packages }: Props) {
  if (packages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <Star className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Aucun programme disponible</h3>
        <p className="text-sm text-muted-foreground">
          Nos programmes Omra seront bientôt disponibles. Contactez-nous au{" "}
          <a
            href="tel:+21698140514"
            className="font-medium text-emerald-700 underline"
          >
            +216 98 140 514
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => (
        <PackageCard key={pkg.id} pkg={pkg} />
      ))}
    </div>
  )
}
