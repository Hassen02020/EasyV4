import { desc } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { marketSignals, type MarketSignal } from "@/lib/db/schema"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type * as schema from "@/lib/db/schema"

export const SIGNALS_PAGE_SIZE = 6

export async function getLatestMarketSignals(
  limit = SIGNALS_PAGE_SIZE,
  db: PostgresJsDatabase<typeof schema> = getDb(),
): Promise<MarketSignal[]> {
  return db
    .select()
    .from(marketSignals)
    .orderBy(desc(marketSignals.publishedAt))
    .limit(limit)
}
