/**
 * CRM-CAMPAIGN-SAFETY-01 — désinscription « un clic » (RFC 8058) : le client
 * mail appelle cette URL en POST depuis l'en-tête List-Unsubscribe des emails
 * de campagne. Voir lib/crm/campaign-unsubscribe-core.ts.
 *
 * Réponse neutre : jamais d'information sur l'existence d'une cible ni sur
 * le contact.
 */

import { NextResponse } from "next/server"
import { withSystemContext } from "@/lib/db/tenant-context"
import { unsubscribeCampaignTargetCore } from "@/lib/crm/campaign-unsubscribe-core"

export const dynamic = "force-dynamic"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
  try {
    await withSystemContext((tx) => unsubscribeCampaignTargetCore(tx, id))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/crm/unsubscribe] échec", {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
