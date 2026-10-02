import { and, eq, inArray } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import {
  destinations,
  destinationExternalRefs,
  type Destination,
  type DestinationExternalRef,
} from "@/lib/db/schema"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type * as schema from "@/lib/db/schema"

export const FEATURED_DESTINATIONS_PAGE_SIZE = 6

export async function getFeaturedDestinations(
  limit = FEATURED_DESTINATIONS_PAGE_SIZE,
  db: PostgresJsDatabase<typeof schema> = getDb(),
): Promise<Destination[]> {
  return db
    .select()
    .from(destinations)
    .where(
      and(eq(destinations.isFeatured, true), eq(destinations.isActive, true)),
    )
    .orderBy(destinations.displayOrder, destinations.name)
    .limit(limit)
}

export async function getExternalRefsForDestinations(
  ids: string[],
  db: PostgresJsDatabase<typeof schema> = getDb(),
): Promise<DestinationExternalRef[]> {
  if (ids.length === 0) return []
  return db
    .select()
    .from(destinationExternalRefs)
    .where(
      and(
        inArray(destinationExternalRefs.destinationId, ids),
        eq(destinationExternalRefs.isActive, true),
      ),
    )
}
