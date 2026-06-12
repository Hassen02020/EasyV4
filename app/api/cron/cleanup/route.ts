/**
 * GET /api/cron/cleanup
 * Nettoyage des inventory_locks expirés.
 * Protégé par CRON_SECRET (Vercel Cron / cron-job.org).
 */

import { NextRequest, NextResponse } from "next/server"
import { cleanExpiredLocks } from "@/lib/booking/inventory"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret")

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { cleaned } = await cleanExpiredLocks()

  return NextResponse.json({
    ok: true,
    cleaned,
    timestamp: new Date().toISOString(),
  })
}
