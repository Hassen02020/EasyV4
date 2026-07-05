/**
 * Tunnel de réservation Omra B2C — /omra/[slug]/reserver
 *
 * Charge le programme (par slug ou UUID) et ses allotments actifs, puis
 * rend le formulaire de réservation public.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { and, asc, eq, gt, or } from "drizzle-orm"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { getDb } from "@/lib/db/client"
import { omraPackages, omraAllotments } from "@/lib/db/schema"
import {
  OmraB2CBookingForm,
  type B2CAllotmentOption,
} from "@/components/omra/omra-b2c-booking-form"

export const dynamic = "force-dynamic"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getPackage(slugOrId: string) {
  try {
    const db = getDb()
    const isUuid = UUID_RE.test(slugOrId)
    const [pkg] = await db
      .select()
      .from(omraPackages)
      .where(
        isUuid
          ? or(
              eq(omraPackages.id, slugOrId),
              eq(omraPackages.slug, slugOrId),
            )
          : eq(omraPackages.slug, slugOrId),
      )
      .limit(1)
    return pkg ?? null
  } catch {
    return null
  }
}

async function getAllotments(packageId: string): Promise<B2CAllotmentOption[]> {
  try {
    const db = getDb()
    const rows = await db
      .select({
        departureDate: omraAllotments.departureDate,
        availableCount: omraAllotments.availableCount,
        overridePrice: omraAllotments.overridePrice,
        bookingDeadline: omraAllotments.bookingDeadline,
      })
      .from(omraAllotments)
      .where(
        and(
          eq(omraAllotments.packageId, packageId),
          eq(omraAllotments.status, "active"),
          gt(omraAllotments.availableCount, 0),
        ),
      )
      .orderBy(asc(omraAllotments.departureDate))
    return rows
  } catch {
    return []
  }
}

export default async function OmraReserverPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const pkg = await getPackage(slug)
  if (!pkg || pkg.status !== "active") notFound()

  const allotments = await getAllotments(pkg.id)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="container mx-auto max-w-4xl flex-1 px-4 py-8">
        <Link
          href={`/omra/${pkg.slug ?? pkg.id}`}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au programme
        </Link>

        <div className="mb-6">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-600 hover:bg-emerald-600">Omra</Badge>
            <Badge variant="outline">{pkg.durationDays} jours</Badge>
          </div>
          <h1 className="text-3xl font-bold">Réserver — {pkg.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Réservation sécurisée · Agence agréée Easy2Book
          </p>
        </div>

        <OmraB2CBookingForm
          packageId={pkg.id}
          basePrice={pkg.basePrice}
          allotments={allotments}
        />
      </main>
      <Footer />
    </div>
  )
}
