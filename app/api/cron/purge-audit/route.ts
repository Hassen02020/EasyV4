/**
 * POST /api/cron/purge-audit
 *
 * Supprime les audit_events de plus de 30 jours.
 * Protégé par CRON_SECRET (header Authorization: Bearer <token>).
 *
 * Usage manuel :
 *   curl -X POST https://<host>/api/cron/purge-audit \
 *        -H "Authorization: Bearer $CRON_SECRET"
 *
 * Config Vercel Cron (plan Pro requis) :
 *   vercel.json → { "crons": [{ "path": "/api/cron/purge-audit", "schedule": "0 3 * * *" }] }
 */

import { NextResponse } from "next/server"
import { getDb } from "@/lib/db/client"
import { auditEvents } from "@/lib/db/schema"
import { lt, sql } from "drizzle-orm"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const auth = request.headers.get("authorization")
  const token = auth?.replace("Bearer ", "")
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 })
  }

  try {
    const db = getDb()
    const cutoff = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30) // 30j
    const result = await db
      .delete(auditEvents)
      .where(lt(auditEvents.createdAt, sql`${cutoff}`))
      .returning({ id: auditEvents.id })

    return NextResponse.json({
      ok: true,
      deleted: result.length,
      cutoff: cutoff.toISOString(),
    })
  } catch (err) {
    console.error("purge-audit failed:", err)
    return NextResponse.json(
      { error: "purge_failed", message: String(err) },
      { status: 500 },
    )
  }
}
