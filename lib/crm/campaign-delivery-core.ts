/**
 * CAMPAIGN-DELIVERY-01 — livraison des messages de campagne aux cibles.
 *
 * Responsabilité : pour une campagne active, charger les campaign_targets
 * 'pending', résoudre leur contactRef, envoyer le message via le canal
 * de la campagne, mettre à jour delivery_status.
 *
 * Canaux supportés :
 *   email     → sendCampaignEmail (Resend, HTML libre)
 *   whatsapp  → skipped (nécessite un template Meta pré-approuvé pour les
 *               messages sortants initiés par l'entreprise — pas encore
 *               configuré, statut = 'skipped', code = TEMPLATE_NOT_CONFIGURED)
 *   call      → skipped (non automatisable, statut = 'skipped',
 *               code = CALL_NOT_AUTOMATED)
 *
 * CRM-CAMPAIGN-SAFETY-01 — garanties d'envoi :
 *  - chaque cible est traitée dans SES PROPRES courtes transactions
 *    (`deps.runTx`) : un envoi réussi est enregistré aussitôt, jamais annulé
 *    par l'échec d'une autre cible ;
 *  - clé d'idempotence Resend `campaign:<campagne>:<cible>` : si l'envoi a
 *    réussi mais que son enregistrement a échoué, le renvoi au retry ne
 *    produit pas de second email ;
 *  - un échec d'envoi laisse la cible 'pending' (reprise au retry Inngest) ;
 *    elle ne passe 'failed' qu'après la dernière tentative
 *    (`markRemainingTargetsFailedCore`, appelé par onFailure) ;
 *  - le statut de la campagne est relu avant CHAQUE envoi : une campagne
 *    annulée n'envoie plus rien, ses cibles restantes passent 'skipped'
 *    (CAMPAIGN_NOT_ACTIVE) ;
 *  - consentement marketing relu avant chaque envoi ; sans référence de
 *    contact, aucune tentative (NO_CONTACT_REF) ;
 *  - sans URL publique du site (lien de désinscription obligatoire), aucun
 *    email n'est envoyé (UNSUBSCRIBE_URL_NOT_CONFIGURED).
 *
 * Pas un fichier "use server" — importé par la fonction Inngest côté serveur.
 */

import { eq, and } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { agencies, campaignTargets, contacts, campaigns } from "@/lib/db/schema"
import {
  sendCampaignEmail,
  type SendCampaignEmailInput,
} from "@/lib/email/send-campaign-email"
import type { CampaignEmailSignature } from "@/lib/email/templates/campaign-email"
import {
  hasMarketingConsentCore,
  normalizeContactRef,
} from "@/lib/crm/consent-core"

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped"

export interface DeliveryOutcome {
  targetId: string
  contactRef: string
  /** 'failed' ici = échec de cette tentative ; la cible reste 'pending' en base. */
  status: DeliveryStatus
  /** Code machine si skipped ou failed. */
  code?: string
  error?: string
}

export interface CampaignDeliveryResult {
  campaignId: string
  sent: number
  skipped: number
  failed: number
  outcomes: DeliveryOutcome[]
}

export interface CampaignDeliveryDeps {
  /** Exécute `fn` dans une courte transaction au contexte de l'agence. */
  runTx: <T>(fn: (tx: DrizzleTransaction) => Promise<T>) => Promise<T>
  /** Injectable pour les tests ; Resend par défaut. */
  sendEmail?: (input: SendCampaignEmailInput) => Promise<void>
  /** URL publique du site (NEXT_PUBLIC_APP_URL par défaut). */
  siteUrl?: string | null
}

/** Clé d'idempotence d'envoi, stable par cible. */
export function campaignEmailIdempotencyKey(
  campaignId: string,
  targetId: string,
): string {
  return `campaign:${campaignId}:${targetId}`
}

/** Liens de désinscription d'une cible (page de confirmation + POST un clic). */
export function campaignUnsubscribeUrls(
  siteUrl: string,
  targetId: string,
): { page: string; oneClick: string } {
  const base = siteUrl.replace(/\/+$/, "")
  return {
    page: `${base}/fr/desabonnement/${targetId}`,
    oneClick: `${base}/api/crm/unsubscribe/${targetId}`,
  }
}

/**
 * CRM-CAMPAIGN-EMAIL-SIGNATURE-01 — coordonnées réelles de l'agence pour la
 * signature (RLS : une agence ne lit que sa propre ligne). Aucun champ n'est
 * complété par une valeur par défaut : un champ vide n'est pas affiché.
 */
export async function loadCampaignSignatureCore(
  tx: DrizzleTransaction,
  agencyId: string,
  siteUrl: string | null,
): Promise<CampaignEmailSignature> {
  const [row] = await tx
    .select({
      phone: agencies.contactPhone,
      whatsapp: agencies.whatsappNumber,
      email: agencies.contactEmail,
      address: agencies.address,
      logoUrl: agencies.logoUrl,
      facebookUrl: agencies.facebookUrl,
      instagramUrl: agencies.instagramUrl,
      tiktokUrl: agencies.tiktokUrl,
    })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1)
  return { ...(row ?? {}), siteUrl }
}

async function setTargetStatus(
  tx: DrizzleTransaction,
  targetId: string,
  status: Exclude<DeliveryStatus, "pending">,
): Promise<void> {
  await tx
    .update(campaignTargets)
    .set({
      deliveryStatus: status,
      deliveredAt: status === "sent" ? new Date() : null,
    })
    .where(eq(campaignTargets.id, targetId))
}

async function campaignIsActive(
  tx: DrizzleTransaction,
  agencyId: string,
  campaignId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.agencyId, agencyId)))
    .limit(1)
  return row?.status === "active"
}

/** Passe toutes les cibles encore 'pending' d'une campagne à `status`. */
export async function settlePendingTargetsCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    campaignId: string
    status: "skipped" | "failed"
  },
): Promise<number> {
  const rows = await tx
    .update(campaignTargets)
    .set({ deliveryStatus: params.status, deliveredAt: null })
    .where(
      and(
        eq(campaignTargets.campaignId, params.campaignId),
        eq(campaignTargets.agencyId, params.agencyId),
        eq(campaignTargets.deliveryStatus, "pending"),
      ),
    )
    .returning({ id: campaignTargets.id })
  return rows.length
}

/**
 * Après épuisement des retries : les cibles encore 'pending' n'ont pas pu
 * être livrées — elles passent 'failed' (visibles comme telles en back-office).
 */
export function markRemainingTargetsFailedCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; campaignId: string },
): Promise<number> {
  return settlePendingTargetsCore(tx, { ...params, status: "failed" })
}

const emptyResult = (campaignId: string): CampaignDeliveryResult => ({
  campaignId,
  sent: 0,
  skipped: 0,
  failed: 0,
  outcomes: [],
})

export async function deliverCampaignCore(
  params: { agencyId: string; campaignId: string; agencyName?: string },
  deps: CampaignDeliveryDeps,
): Promise<CampaignDeliveryResult> {
  const { agencyId, campaignId } = params
  const sendEmail = deps.sendEmail ?? sendCampaignEmail
  const siteUrl =
    deps.siteUrl === undefined
      ? (process.env.NEXT_PUBLIC_APP_URL ?? null)
      : deps.siteUrl

  // 1. Campagne
  const campaign = await deps.runTx(async (tx) => {
    const [row] = await tx
      .select({
        id: campaigns.id,
        name: campaigns.name,
        channel: campaigns.channel,
        message: campaigns.message,
        status: campaigns.status,
      })
      .from(campaigns)
      .where(
        and(eq(campaigns.id, campaignId), eq(campaigns.agencyId, agencyId)),
      )
      .limit(1)
    return row ?? null
  })
  if (!campaign) return emptyResult(campaignId)

  // Campagne plus active (annulée, terminée) : rien n'est envoyé.
  if (campaign.status !== "active") {
    const skipped = await deps.runTx((tx) =>
      settlePendingTargetsCore(tx, { agencyId, campaignId, status: "skipped" }),
    )
    return { ...emptyResult(campaignId), skipped }
  }

  // 2. Cibles pending + référence de contact
  const pendingTargets = await deps.runTx((tx) =>
    tx
      .select({
        id: campaignTargets.id,
        contactRef: contacts.contactRef,
      })
      .from(campaignTargets)
      .leftJoin(contacts, eq(contacts.id, campaignTargets.contactId))
      .where(
        and(
          eq(campaignTargets.campaignId, campaignId),
          eq(campaignTargets.agencyId, agencyId),
          eq(campaignTargets.deliveryStatus, "pending"),
        ),
      ),
  )

  const outcomes: DeliveryOutcome[] = []
  const message = campaign.message ?? ""
  const signature =
    campaign.channel === "email" && pendingTargets.length > 0
      ? await deps.runTx((tx) =>
          loadCampaignSignatureCore(tx, agencyId, siteUrl),
        )
      : undefined

  // 3. Livraison, une cible à la fois
  for (const target of pendingTargets) {
    const contactRef = target.contactRef ?? ""

    // Garde avant envoi : campagne toujours active, référence et consentement.
    const guard = await deps.runTx(async (tx) => {
      if (!(await campaignIsActive(tx, agencyId, campaignId))) {
        await settlePendingTargetsCore(tx, {
          agencyId,
          campaignId,
          status: "skipped",
        })
        return "CAMPAIGN_NOT_ACTIVE" as const
      }
      if (!contactRef) {
        await setTargetStatus(tx, target.id, "skipped")
        return "NO_CONTACT_REF" as const
      }
      const hasConsent = await hasMarketingConsentCore(tx, {
        agencyId,
        channel: campaign.channel,
        contactRef: normalizeContactRef(contactRef),
      })
      if (!hasConsent) {
        await setTargetStatus(tx, target.id, "skipped")
        return "CONSENT_REVOKED" as const
      }
      return null
    })

    if (guard === "CAMPAIGN_NOT_ACTIVE") {
      outcomes.push({
        targetId: target.id,
        contactRef,
        status: "skipped",
        code: guard,
      })
      break
    }
    if (guard) {
      outcomes.push({
        targetId: target.id,
        contactRef,
        status: "skipped",
        code: guard,
      })
      continue
    }

    if (campaign.channel === "email") {
      if (!siteUrl) {
        // Pas de lien de désinscription possible : on n'envoie pas.
        outcomes.push({
          targetId: target.id,
          contactRef,
          status: "failed",
          code: "UNSUBSCRIBE_URL_NOT_CONFIGURED",
          error: "NEXT_PUBLIC_APP_URL not configured",
        })
        continue
      }
      const urls = campaignUnsubscribeUrls(siteUrl, target.id)
      try {
        await sendEmail({
          to: contactRef,
          campaignName: campaign.name,
          message,
          agencyName: params.agencyName,
          unsubscribeUrl: urls.page,
          oneClickUnsubscribeUrl: urls.oneClick,
          signature,
          idempotencyKey: campaignEmailIdempotencyKey(campaignId, target.id),
        })
      } catch (err) {
        // La cible reste 'pending' : elle sera reprise au retry.
        outcomes.push({
          targetId: target.id,
          contactRef,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }
      // Envoi réussi : enregistré aussitôt, dans sa propre transaction.
      await deps.runTx((tx) => setTargetStatus(tx, target.id, "sent"))
      outcomes.push({ targetId: target.id, contactRef, status: "sent" })
    } else {
      // whatsapp : modèle Meta non configuré ; call : non automatisable.
      const code =
        campaign.channel === "whatsapp"
          ? "TEMPLATE_NOT_CONFIGURED"
          : "CALL_NOT_AUTOMATED"
      await deps.runTx((tx) => setTargetStatus(tx, target.id, "skipped"))
      outcomes.push({
        targetId: target.id,
        contactRef,
        status: "skipped",
        code,
      })
    }
  }

  return {
    campaignId,
    sent: outcomes.filter((o) => o.status === "sent").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  }
}
