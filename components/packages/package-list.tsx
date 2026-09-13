"use client"

import { Link } from "@/i18n/navigation"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Globe, Clock, ChevronRight, Plane } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { CatalogPackage } from "@/lib/db/schema"

type PackageWithPrice = CatalogPackage & { priceFromTnd: number | null; coverMediaUrl?: string | null }

interface Props {
  packages: PackageWithPrice[]
}

function PackageCard({ pkg }: { pkg: PackageWithPrice }) {
  const t = useTranslations("Packages")
  // Fallback mission §23 : Media System en priorité, sinon coverImage
  // (legacy), sinon dégradé de marque (jamais de fausse photo, mission §33).
  const coverImage = pkg.coverMediaUrl || pkg.coverImage
  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative h-44 w-full bg-muted">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={pkg.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-800 to-violet-600">
            <Globe className="h-12 w-12 text-white/40" />
          </div>
        )}
        {pkg.durationDays && (
          <Badge className="absolute left-3 top-3 bg-black/60 text-white">
            {t("durationBadge", { days: pkg.durationDays, nights: pkg.durationNights ?? pkg.durationDays - 1 })}
          </Badge>
        )}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="mb-0.5 text-xs text-muted-foreground uppercase tracking-wide">
            {pkg.code}
          </p>
          <h3 className="text-base font-semibold leading-tight">{pkg.title}</h3>
          {pkg.shortDescription && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {pkg.shortDescription}
            </p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          {pkg.transportMode && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Plane className="h-3 w-3" />
              {pkg.transportMode}
            </div>
          )}
          {pkg.durationDays && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {t("daysCount", { days: pkg.durationDays })}
            </div>
          )}
        </div>

        {pkg.priceFromTnd != null && (
          <div className="mt-auto">
            <p className="text-xs text-muted-foreground">{t("startingFrom")}</p>
            <p className="text-2xl font-bold text-violet-700">
              {pkg.priceFromTnd.toLocaleString("fr-FR")}
              <span className="ml-1 text-sm font-normal">{t("priceUnitPerPerson")}</span>
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t p-4">
        <Link href={`/packages/${pkg.slug}`} className="w-full">
          <Button className="w-full gap-2 bg-violet-700 hover:bg-violet-800">
            {t("viewProgram")}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}

export function PackageList({ packages }: Props) {
  const t = useTranslations("Packages")
  if (packages.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed bg-card p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-50">
          <Globe className="h-8 w-8 text-violet-600" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">
          {t("emptyTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("emptyDescription")}
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {t("circuitsAvailableCount", { count: packages.length })}
      </p>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
    </div>
  )
}
