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
 * Idempotence (CRM-SOCIAL-CODE-FIX-01) :
 *  - Resend envoie un `email_id` unique par email ; le lead est enregistré
 *    avec `source_page = email_inbound:<email_id>` et un renvoi du même
 *    email_id (même simultané, verrou transactionnel) ne crée ni lead ni
 *    notification (lib/crm/inbound-email-capture-core.ts).
 *  - Provenance `email` / `email_inbound` (jamais `website_form`).
 *
 * Pas de GET : Resend inbound ne fait pas de handshake `hub.*` à la
 * différence des webhooks Meta.
 */

import { type NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { withTenantContext } from "@/lib/db/tenant-context"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { captureInboundEmailLeadCore } from "@/lib/crm/inbound-email-capture-core"
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
        captureInboundEmailLeadCore(tx, {
          agencyId,
          firstName,
          email,
          message,
          emailId,
        }),
    )
    // G-03 — email « nouveau lead » seulement à la création : un renvoi du
    // même email_id (CRM-SOCIAL-CODE-FIX-01) ne notifie pas une seconde fois.
    if (!captured.alreadyProcessed) {
      await notifyLeadCreated({
        agencyId,
        leadId: captured.leadId,
        channel: "email",
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[Webhook/ResendInbound] Échec traitement email entrant", err)
    return NextResponse.json({ error: "Processing error" }, { status: 500 })
  }
}
