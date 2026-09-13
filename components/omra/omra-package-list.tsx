"use client"

import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Star, Plane, Hotel, Users, Clock, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { OmraPackage } from "@/lib/db/schema"

type OmraPackageWithMedia = OmraPackage & { coverMediaUrl?: string | null }

interface Props {
  packages: OmraPackageWithMedia[]
}

const PACKAGE_TYPE_KEYS = new Set(["omra", "hajj", "ramadan", "umrah_plus"])

function formatDate(d: string | Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function PackageCard({ pkg }: { pkg: OmraPackageWithMedia }) {
  const t = useTranslations("Omra")
  const label = PACKAGE_TYPE_KEYS.has(pkg.type) ? t(`packageTypes.${pkg.type}`) : pkg.type
  const priceTnd = pkg.basePrice ? parseFloat(pkg.basePrice) : null
  // Fallback mission §23 : Media System (couverture uploadée par l'admin) en
  // priorité, sinon l'ancien champ metadata.coverImage (voir
  // lib/admin/schemas/omra-product.ts), sinon aucune image (pas de fausse
  // photo générique, mission §33 — juste le dégradé de marque ci-dessous).
  const legacyCoverImage = (pkg.metadata as { coverImage?: string } | null)?.coverImage || null
  const coverImage = pkg.coverMediaUrl || legacyCoverImage

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative bg-gradient-to-br from-emerald-800 to-emerald-600 p-5 text-white">
        {coverImage && (
          <Image
            src={coverImage}
            alt={pkg.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        )}
        <Badge
          variant="secondary"
          className="absolute right-3 top-3 z-10 bg-white/20 text-white"
        >
          {label}
        </Badge>
        <h3 className={`relative z-10 mb-1 pr-24 text-lg font-semibold leading-tight ${coverImage ? "drop-shadow" : ""}`}>
          {pkg.name}
        </h3>
        <p className={`relative z-10 text-sm ${coverImage ? "text-white/90 drop-shadow" : "text-emerald-200"}`}>
          {pkg.description}
        </p>
        {coverImage && <div className="absolute inset-0 bg-black/30" />}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{t("daysCount", { days: pkg.durationDays })}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{t("seatsAvailableLabel")}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Plane className="h-3.5 w-3.5" />
            <span>{t("flightIncluded")}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Hotel className="h-3.5 w-3.5" />
            <span>{t("hotelIncluded")}</span>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <p className="text-xs text-muted-foreground">{t("departureFrom")}</p>
          <p className="font-medium">{formatDate(pkg.validFrom)}</p>
        </div>

        {priceTnd && (
          <div className="mt-auto">
            <p className="text-xs text-muted-foreground">{t("startingFrom")}</p>
            <p className="text-2xl font-bold text-emerald-700">
              {priceTnd.toLocaleString("fr-FR")}
              <span className="ml-1 text-sm font-normal">{t("priceUnitPerPilgrim")}</span>
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t p-4">
        <Link href={`/omra/${pkg.id}`} className="w-full">
          <Button className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800">
            {t("viewProgram")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}

export function OmraPackageList({ packages }: Props) {
  const t = useTranslations("Omra")
  if (packages.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed bg-card p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <Star className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">{t("emptyTitle")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("emptyDescriptionPrefix")}{" "}
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
    <div className="mt-4">
      <p className="mb-4 text-sm text-muted-foreground">
        {t("packagesAvailableCount", { count: packages.length })}
      </p>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
    </div>
  )
}
