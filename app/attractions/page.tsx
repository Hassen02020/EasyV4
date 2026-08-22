/**
 * Page Attractions — /attractions
 * Server Component : charge les attractions publiées depuis catalog_activities.
 * Phase 13.1, gap #1 — première page publique du module (le catalogue
 * existait depuis Phase 13, sans aucune vitrine publique jusqu'ici).
 */

import Link from "next/link"
import Image from "next/image"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Badge } from "@/components/ui/badge"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogActivities } from "@/lib/db/schema"
import { and, eq, arrayContains } from "drizzle-orm"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { MapPin, Clock, Compass } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Attractions | Easy2Book",
  description: "Excursions, visites guidées et activités à réserver en ligne en Tunisie.",
}

async function getPublishedActivities() {
  try {
    const agencyId = await getDefaultAgencyId()
    if (!agencyId) return []
    return await withSystemContext(async (db) => {
      return await db
        .select()
        .from(catalogActivities)
        .where(
          and(
            eq(catalogActivities.status, "published"),
            eq(catalogActivities.agencyId, agencyId),
            arrayContains(catalogActivities.channels, ["b2c"]),
          ),
        )
        .orderBy(catalogActivities.title)
    })
  } catch {
    return []
  }
}

export default async function AttractionsPage() {
  const activities = await getPublishedActivities()

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/30">
        <div className="bg-gradient-to-br from-teal-900 to-teal-700 px-4 py-12 text-white">
          <div className="mx-auto max-w-4xl text-center">
            <p className="mb-2 text-sm font-medium tracking-widest text-teal-300 uppercase">
              Attractions
            </p>
            <h1 className="mb-4 text-3xl font-bold md:text-4xl">
              Excursions et activités en Tunisie
            </h1>
            <p className="mx-auto max-w-2xl text-teal-100">
              Visites guidées, excursions et expériences à réserver en ligne, confirmation immédiate.
            </p>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-8">
          {activities.length === 0 ? (
            <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
              <Compass className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              Aucune attraction disponible pour le moment. Revenez bientôt !
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {activities.map((a) => (
                <Link
                  key={a.id}
                  href={`/attractions/${a.slug}`}
                  className="group overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg"
                >
                  <div className="relative h-40 w-full bg-muted">
                    {a.coverImage ? (
                      <Image
                        src={a.coverImage}
                        alt={a.title}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-teal-800 to-teal-600">
                        <Compass className="h-10 w-10 text-white/30" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    {a.location && (
                      <Badge variant="outline" className="mb-2 gap-1 text-xs">
                        <MapPin className="h-3 w-3" />
                        {a.location}
                      </Badge>
                    )}
                    <h3 className="mb-1 font-semibold group-hover:text-teal-700">{a.title}</h3>
                    {a.shortDescription && (
                      <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                        {a.shortDescription}
                      </p>
                    )}
                    {a.durationMinutes && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {a.durationMinutes} min
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
