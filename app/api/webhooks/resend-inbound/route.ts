/**
 * CRM-E — webhook email entrant Resend.
 *
 * Resend transfère les emails entrants (reçus sur votre domaine MX) vers
 * cette route. Chaque email crée un lead CRM avec channel="email".
 *
 * Sécurité :
 *  - RESEND_INBOUND_SECRET attendu dans `Authorization: Bearer <secret>`.
 *  - 503 si la variable d'environnement est absente (même discipline que
 *    les autres webhooks — jamais un faux succès).
 *  - Le secret est comparé en constant-time (timingSafeEqual).
 *
 * Idempotence :
 *  - Resend envoie un `email_id` unique par email ; il est passé comme
 *    `externalMessageId` dans createLeadCore → lead dupliqué impossible
 *    (sourcePage stocke l'email_id, pas de contrainte DB unique ici — si
 *    Resend re-livre, le deuxième appel créera un lead ; acceptable car
 *    les agents voient les doublons en pipeline). Si une garantie stricte
 *    est nécessaire plus tard, ajouter un index unique sur
 *    (agency_id, source_page) dans leads.
 *
 * Pas de GET : Resend inbound ne fait pas de handshake `hub.*` à la
 * différence des webhooks Meta.
 */

import { type NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { captureWebsiteLeadCore } from "@/lib/crm/website-lead-capture-core"
import { notifyLeadCreated } from "@/lib/crm/lead-created-notify"

interface ResendInboundPayload {
  email_id?: string
  from?: string
  to?: string | string[]
  subject?: string
  text?: string
  html?: string
}

function extractFirstName(from: string): string {
  const nameMatch = from.match(/^"?([^"<@]+)"?\s*</i)
  if (nameMatch?.[1]) return nameMatch[1].trim().split(/\s+/)[0] || "Contact"
  const emailLocal = from.split("@")[0] || "Contact"
  return emailLocal.replace(/[._+-]/g, " ").split(" ")[0] || "Contact"
}

function extractEmail(from: string): string | null {
  const match = from.match(/<([^>]+)>/) ?? from.match(/([^\s<>@]+@[^\s<>@]+)/)
  return match?.[1]?.toLowerCase() ?? null
}

function verifyBearer(header: string | null, secret: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false
  const token = header.slice(7)
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const inboundSecret = process.env.RESEND_INBOUND_SECRET
  if (!inboundSecret) {
    console.error("[Webhook/ResendInbound] RESEND_INBOUND_SECRET manquant")
    return NextResponse.json({ error: "Misconfigured" }, { status: 503 })
  }

  const authOk = verifyBearer(
    request.headers.get("authorization"),
    inboundSecret,
  )
  if (!authOk) {
    console.warn("[Webhook/ResendInbound] Autorisation invalide — rejetée")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: ResendInboundPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const from = payload.from ?? ""
  const email = extractEmail(from)
  if (!email) {
    return NextResponse.json({ error: "No sender email" }, { status: 400 })
  }

  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    console.error("[Webhook/ResendInbound] Aucune agence par défaut résolue")
    return NextResponse.json({ error: "No agency configured" }, { status: 503 })
  }

  const firstName = extractFirstName(from)
  const subject = payload.subject ?? null
  const body = payload.text ?? payload.html ?? null
  const message = [subject, body].filter(Boolean).join(" — ") || null
  const emailId = payload.email_id ?? null

  try {
    const captured = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: true },
      (tx) =>
        captureWebsiteLeadCore(tx, {
          agencyId,
          firstName,
          email,
          message,
          productType: "general",
          sourcePage: emailId ? `email_inbound:${emailId}` : "email_inbound",
          intention: "standard",
        }),
    )
    // G-03 — chaque email entrant crée un lead : email « nouveau lead ».
    await notifyLeadCreated({
      agencyId,
      leadId: captured.leadId,
      channel: "email",
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[Webhook/ResendInbound] Échec traitement email entrant", err)
    return NextResponse.json({ error: "Processing error" }, { status: 500 })
  }
}
