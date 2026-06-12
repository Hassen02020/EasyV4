"use client"

import Link from "next/link"
import { Star, Plane, Hotel, Users, Clock, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import type { OmraPackage } from "@/lib/db/schema"

interface Props {
  packages: OmraPackage[]
}

const PACKAGE_TYPE_LABELS: Record<string, string> = {
  omra: "Omra Régulière",
  hajj: "Hajj",
  ramadan: "Omra Ramadan",
  umrah_plus: "Omra + Ziarat",
}

function formatDate(d: string | Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function PackageCard({ pkg }: { pkg: OmraPackage }) {
  const label = PACKAGE_TYPE_LABELS[pkg.type] ?? pkg.type
  const priceTnd = pkg.basePrice ? parseFloat(pkg.basePrice) : null

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative bg-gradient-to-br from-emerald-800 to-emerald-600 p-5 text-white">
        <Badge
          variant="secondary"
          className="absolute right-3 top-3 bg-white/20 text-white"
        >
          {label}
        </Badge>
        <h3 className="mb-1 pr-24 text-lg font-semibold leading-tight">
          {pkg.name}
        </h3>
        <p className="text-sm text-emerald-200">{pkg.description}</p>
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{pkg.durationDays} jours</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>Places dispo</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Plane className="h-3.5 w-3.5" />
            <span>Vol inclus</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Hotel className="h-3.5 w-3.5" />
            <span>Hôtel inclus</span>
          </div>
        </div>

        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <p className="text-xs text-muted-foreground">Départ à partir du</p>
          <p className="font-medium">{formatDate(pkg.validFrom)}</p>
        </div>

        {priceTnd && (
          <div className="mt-auto">
            <p className="text-xs text-muted-foreground">À partir de</p>
            <p className="text-2xl font-bold text-emerald-700">
              {priceTnd.toLocaleString("fr-FR")}
              <span className="ml-1 text-sm font-normal">DT / pèlerin</span>
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t p-4">
        <Link href={`/omra/${pkg.id}`} className="w-full">
          <Button className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800">
            Voir le programme
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  )
}

export function OmraPackageList({ packages }: Props) {
  if (packages.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-dashed bg-card p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <Star className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">Aucun package disponible</h3>
        <p className="text-sm text-muted-foreground">
          Nos packages Omra seront bientôt disponibles. Contactez-nous au{" "}
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
        {packages.length} package{packages.length > 1 ? "s" : ""} disponible
        {packages.length > 1 ? "s" : ""}
      </p>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => (
          <PackageCard key={pkg.id} pkg={pkg} />
        ))}
      </div>
    </div>
  )
}
