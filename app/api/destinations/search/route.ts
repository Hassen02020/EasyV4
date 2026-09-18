/**
 * GET /api/destinations/search?module=hotels_monde_slug|packages_slug|iata
 *
 * PHASE PREMIUM 2 — Chantier 3 (Destination Search / Autocomplete unifié).
 * Source unique pour le nouveau composant `<DestinationAutocomplete>` —
 * lit `destinations`/`destination_external_refs` (chantier 2) et renvoie
 * toujours l'`external_id` déjà utilisé par le module appelant (jamais
 * l'UUID interne), pour que la sélection reste 100% compatible avec les
 * query params existants (`destination=istanbul`, `origin=IST`, ...).
 *
 * `mygo_city` est volontairement exclu de la liste acceptée : Hôtels
 * Tunisie garde son propre autocomplete backend-réel (/api/hotels/cities,
 * données myGo fraîches) — hors périmètre de ce chantier, voir
 * docs/audits/destination-search-autocomplete-audit.md.
 *
 * Lecture publique (catalogue géo sans secret) — même mécanisme que le
 * reste du catalogue public (withSystemContext()), cohérent avec la RLS
 * posée au chantier 2 (0054_destinations.sql).
 *
 * Chantier 4 (Pages Destination + SEO) : réponse enrichie de `slug` — le
 * slug PUBLIC de `destinations` (utilisé par les URLs `/destinations/[slug]`),
 * jamais l'UUID interne — pour que le front puisse relier une sélection
 * d'autocomplete à sa fiche destination sans requête supplémentaire.
 */

import { NextRequest, NextResponse } from "next/server"
import { eq, and } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { destinations, destinationExternalRefs } from "@/lib/db/schema"
import { withSystemContext } from "@/lib/db/tenant-context"

export const revalidate = 86400 // 24h — les destinations ne changent quasiment jamais

const ALLOWED_MODULES = ["hotels_monde_slug", "packages_slug", "iata"] as const
type AllowedModule = (typeof ALLOWED_MODULES)[number]

function isAllowedModule(value: string | null): value is AllowedModule {
  return !!value && (ALLOWED_MODULES as readonly string[]).includes(value)
}

export async function GET(req: NextRequest) {
  const moduleParam = req.nextUrl.searchParams.get("module")
  if (!isAllowedModule(moduleParam)) {
    return NextResponse.json(
      { error: "invalid_module", message: `module doit être l'un de : ${ALLOWED_MODULES.join(", ")}` },
      { status: 400 },
    )
  }

  const country = alias(destinations, "country")

  const rows = await withSystemContext((tx) =>
    tx
      .select({
        externalId: destinationExternalRefs.externalId,
        slug: destinations.slug,
        name: destinations.name,
        nameEn: destinations.nameEn,
        nameAr: destinations.nameAr,
        countryName: country.name,
        countryNameEn: country.nameEn,
        countryNameAr: country.nameAr,
      })
      .from(destinationExternalRefs)
      .innerJoin(destinations, eq(destinationExternalRefs.destinationId, destinations.id))
      .leftJoin(country, eq(destinations.parentId, country.id))
      .where(
        and(
          eq(destinationExternalRefs.module, moduleParam),
          eq(destinationExternalRefs.isActive, true),
          eq(destinations.isActive, true),
        ),
      )
      .orderBy(destinations.name),
  )

  return NextResponse.json(
    { destinations: rows },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=86400, immutable",
      },
    },
  )
}
