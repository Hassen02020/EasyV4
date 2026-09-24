/**
 * Price Snapshot Service — Flight Puzzle
 *
 * Creates and manages immutable price snapshots.
 * The frontend only ever receives a snapshotId — the supplier price,
 * fee, and markup are stored server-side and never transmitted to the client.
 *
 * Snapshot TTL: 20 minutes (IATA standard offer validity).
 */

import { flightPriceSnapshots } from "@/lib/db/schema/flights"
import { eq, lt, and } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import type { CanonicalItinerary } from "./canonical"
import { applyCommercialEngine, type DistributionChannel } from "./commercial-engine"

/** Snapshot TTL in minutes. */
const SNAPSHOT_TTL_MINUTES = 20

export interface CreateSnapshotInput {
  searchDbId: string | null
  agencyId: string
  itinerary: CanonicalItinerary
  channel?: DistributionChannel
}

export interface SnapshotResult {
  snapshotId: string
  sellingAmount: number
  sellingCurrency: string
  expiresAt: Date
}

/**
 * Create a price snapshot for one itinerary.
 * Applies the commercial engine; persists to DB.
 */
export async function createPriceSnapshot(
  input: CreateSnapshotInput,
): Promise<SnapshotResult> {
  const commercial = await applyCommercialEngine(
    input.itinerary.supplierTotalAmount,
    input.itinerary.supplierCurrency,
    input.agencyId,
    input.channel ?? "B2C",
  )

  const expiresAt = new Date(Date.now() + SNAPSHOT_TTL_MINUTES * 60 * 1000)

  const rows = await withSystemContext((tx) =>
    tx
      .insert(flightPriceSnapshots)
      .values({
        searchId: input.searchDbId ?? undefined,
        agencyId: input.agencyId,
        provider: input.itinerary.provider.provider,
        providerOfferId: input.itinerary.provider.providerOfferId,
        itinerary: input.itinerary as unknown as Record<string, unknown>,
        supplierAmount: String(commercial.supplierAmount),
        supplierCurrency: commercial.supplierCurrency,
        fee: String(commercial.fee),
        markup: String(commercial.markup),
        sellingAmount: String(commercial.sellingAmount),
        sellingCurrency: commercial.sellingCurrency,
        baggage: input.itinerary.baggage as unknown as Record<string, unknown>,
        fareRules: input.itinerary.fareRules as unknown as Record<string, unknown>,
        status: "ACTIVE",
        expiresAt,
      })
      .returning({ id: flightPriceSnapshots.id }),
  )

  return {
    snapshotId: (rows as Array<{ id: string }>)[0].id,
    sellingAmount: commercial.sellingAmount,
    sellingCurrency: commercial.sellingCurrency,
    expiresAt,
  }
}

/**
 * Load a snapshot and validate it is ACTIVE and not expired.
 */
export async function getPriceSnapshot(snapshotId: string) {
  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(flightPriceSnapshots)
      .where(eq(flightPriceSnapshots.id, snapshotId))
      .limit(1),
  )

  const list = rows as typeof flightPriceSnapshots.$inferSelect[]
  if (list.length === 0) return null
  const snapshot = list[0]

  if (snapshot.status !== "ACTIVE") return null
  if (snapshot.expiresAt < new Date()) {
    await withSystemContext((tx) =>
      tx
        .update(flightPriceSnapshots)
        .set({ status: "EXPIRED" })
        .where(eq(flightPriceSnapshots.id, snapshotId)),
    )
    return null
  }

  return snapshot
}

/**
 * Mark a snapshot as USED (consumed by a booking request).
 * Idempotent — won't downgrade from EXPIRED or INVALIDATED.
 */
export async function markSnapshotUsed(snapshotId: string): Promise<void> {
  await withSystemContext((tx) =>
    tx
      .update(flightPriceSnapshots)
      .set({ status: "USED" })
      .where(
        and(
          eq(flightPriceSnapshots.id, snapshotId),
          eq(flightPriceSnapshots.status, "ACTIVE"),
        ),
      ),
  )
}

/**
 * Expire all snapshots past their TTL. Call from a cron job.
 */
export async function expireStaleSnapshots(): Promise<number> {
  const result = await withSystemContext((tx) =>
    tx
      .update(flightPriceSnapshots)
      .set({ status: "EXPIRED" })
      .where(
        and(
          eq(flightPriceSnapshots.status, "ACTIVE"),
          lt(flightPriceSnapshots.expiresAt, new Date()),
        ),
      )
      .returning({ id: flightPriceSnapshots.id }),
  )
  return (result as Array<{ id: string }>).length
}
