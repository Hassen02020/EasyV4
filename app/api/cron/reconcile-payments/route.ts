/**
 * GET /api/cron/reconcile-payments
 *
 * Réconciliation financière quotidienne — détecte les dérives payment/
 * webhook/wallet non auto-corrigées par les autres crons (voir
 * lib/finance/reconciliation.ts pour le détail des 4 contrôles et leurs
 * limites assumées). Ne corrige jamais rien automatiquement — journalise
 * chaque écart dans audit_events pour investigation humaine.
 *
 * Même garde CRON_SECRET que les autres crons (pattern existant, pas un
 * nouveau choix de sécurité).
 */

import { NextRequest, NextResponse } from "next/server"
import { runPaymentReconciliation } from "@/lib/finance/reconciliation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "")
  const secret = bearer ?? req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Base de données non configurée" }, { status: 500 })
  }

  const { counts, findings, skipped, unresolvedAgencyWarnings } = await runPaymentReconciliation()

  return NextResponse.json({
    ok: true,
    skipped,
    counts,
    total: findings.length,
    unresolvedAgencyWarnings,
    timestamp: new Date().toISOString(),
  })
}
