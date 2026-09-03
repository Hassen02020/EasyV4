/**
 * GET /api/cron/expire-loyalty-points
 *
 * Easy2Book Rewards (Phase 38D) — expiration après 24 mois d'inactivité
 * (mandat explicite, voir lib/loyalty/rewards-core.ts::expireInactiveAccountsForAgency).
 * Traitement par lot, une agence à la fois — même garde `CRON_SECRET` que
 * les autres crons (/api/cron/cleanup, /api/cron/expire-pending-payments).
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { loyaltyAccounts } from "@/lib/db/schema"
import { expireInactiveAccountsForAgency } from "@/lib/loyalty/rewards-core"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 500 })
  }

  const result = await withSystemContext(async (tx) => {
    const agencyRows = await tx
      .selectDistinct({ agencyId: loyaltyAccounts.agencyId })
      .from(loyaltyAccounts)
      .where(sql`${loyaltyAccounts.pendingPoints} > 0 or ${loyaltyAccounts.availablePoints} > 0`)

    let accountsExpired = 0
    let totalPointsExpired = 0
    for (const { agencyId } of agencyRows) {
      const outcome = await expireInactiveAccountsForAgency(tx, { agencyId })
      accountsExpired += outcome.accountsExpired
      totalPointsExpired += outcome.totalPointsExpired
    }
    return { agenciesScanned: agencyRows.length, accountsExpired, totalPointsExpired }
  })

  return NextResponse.json({
    ok: true,
    ...result,
    timestamp: new Date().toISOString(),
  })
}
