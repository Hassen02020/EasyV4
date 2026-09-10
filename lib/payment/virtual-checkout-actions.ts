"use server"

/**
 * Page de paiement simulée (`/paiement-simule/[ref]`) — CÔTÉ PSP HÉBERGÉ
 * factice pour le Virtual Payment Provider (test/dev uniquement, voir
 * lib/payment/virtual-payment-provider.ts). Ne confirme JAMAIS le paiement
 * localement : "Simuler succès/échec" déclenche le VRAI webhook signé
 * (app/api/payment/reservation-webhook/route.ts, format SPS Monétique
 * Tunisie — même corps/scellé que `buildVirtualWebhookRequest` génère déjà
 * pour les tests du webhook wallet B2B, réutilisé tel quel) — la seule
 * source de vérité pour la confirmation reste ce webhook, exactement comme
 * un vrai PSP le ferait.
 *
 * `pspOrderId` (référence imprévisible, `crypto.randomUUID()`) fait office
 * de jeton de capacité pour cette page — même modèle de confiance que
 * `guestAccessToken` ailleurs dans le tunnel B2C (voir
 * lib/booking/guest-actions.ts) : aucune authentification requise, la
 * connaissance de la référence suffit, exactement comme un vrai lien PSP.
 */

import { eq, and } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { payments, reservations } from "@/lib/db/schema"
import { isVirtualPaymentModeEnabled } from "./virtual-payment-provider"
import { buildVirtualWebhookRequest } from "./virtual-provider"
import { siteOrigin } from "@/lib/mygo/config"

export type VirtualPaymentSessionResult =
  | { ok: true; amountTnd: number; publicRef: string; guestAccessToken: string; offerLabel: string }
  | { ok: false; error: string }

export async function getVirtualPaymentSession(ref: string): Promise<VirtualPaymentSessionResult> {
  if (!isVirtualPaymentModeEnabled()) {
    return { ok: false, error: "Le mode de paiement simulé n'est pas activé sur cet environnement." }
  }
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const [row] = await withSystemContext((tx) =>
    tx
      .select({
        status: payments.status,
        tndAmount: payments.tndAmount,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
        providerPayload: reservations.providerPayload,
      })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .where(and(eq(payments.pspOrderId, ref), eq(payments.psp, "virtual")))
      .limit(1),
  )

  if (!row) {
    return { ok: false, error: "Session de paiement introuvable ou expirée." }
  }
  if (row.status !== "pending") {
    return { ok: false, error: "Ce paiement a déjà été traité." }
  }

  const payload = (row.providerPayload as Record<string, unknown> | null) ?? {}
  const offerLabel = typeof payload.offerLabel === "string" ? payload.offerLabel : "Réservation"

  return {
    ok: true,
    amountTnd: Number.parseFloat(row.tndAmount),
    publicRef: row.publicRef,
    guestAccessToken: row.guestAccessToken,
    offerLabel,
  }
}

export type SimulateVirtualPaymentResult = { ok: true } | { ok: false; error: string }

export async function simulateVirtualPayment(
  ref: string,
  outcome: "success" | "failure",
): Promise<SimulateVirtualPaymentResult> {
  if (!isVirtualPaymentModeEnabled()) {
    return { ok: false, error: "Le mode de paiement simulé n'est pas activé sur cet environnement." }
  }
  const secret = process.env.SPS_HMAC_KEY
  if (!secret) {
    return { ok: false, error: "SPS_HMAC_KEY manquant — requis même en mode simulé pour signer le webhook." }
  }

  const session = await getVirtualPaymentSession(ref)
  if (!session.ok) {
    return session
  }

  const request = buildVirtualWebhookRequest(outcome === "success" ? "CARD_SUCCESS" : "CARD_DECLINED", {
    provider: "sps",
    providerRef: ref,
    amountTnd: session.amountTnd,
    secret,
    webhookPath: "/api/payment/reservation-webhook",
  })

  const res = await fetch(request.url(siteOrigin()), {
    method: "POST",
    headers: request.headers,
    body: request.body,
  })
  if (!res.ok) {
    return { ok: false, error: `Échec de simulation (HTTP ${res.status}).` }
  }
  return { ok: true }
}
