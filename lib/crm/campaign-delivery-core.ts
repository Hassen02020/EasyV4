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
 * Idempotence : seules les lignes delivery_status = 'pending' sont
 * traitées. Un retry Inngest ne renvoie jamais un message déjà 'sent'.
 *
 * Pas un fichier "use server" — importé par la fonction Inngest côté serveur.
 */

import { eq, and, inArray } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { campaignTargets, contacts, campaigns } from "@/lib/db/schema"
import { sendCampaignEmail } from "@/lib/email/send-campaign-email"

export type DeliveryStatus = "pending" | "sent" | "failed" | "skipped"

export interface DeliveryOutcome {
  targetId: string
  contactRef: string
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

/**
 * Charge la campagne + toutes les cibles 'pending' + contacts associés,
 * envoie via le canal approprié, met à jour delivery_status dans la MÊME
 * transaction (atomique par lot).
 */
export async function deliverCampaignCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; campaignId: string; agencyName?: string },
): Promise<CampaignDeliveryResult> {
  // 1. Charger la campagne
  const [campaign] = await tx
    .select({
      id: campaigns.id,
      name: campaigns.name,
      channel: campaigns.channel,
      message: campaigns.message,
      status: campaigns.status,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.agencyId, params.agencyId),
      ),
    )
    .limit(1)

  if (!campaign) {
    return {
      campaignId: params.campaignId,
      sent: 0,
      skipped: 0,
      failed: 0,
      outcomes: [],
    }
  }

  // 2. Charger les cibles pending
  const pendingTargets = await tx
    .select({
      id: campaignTargets.id,
      contactId: campaignTargets.contactId,
    })
    .from(campaignTargets)
    .where(
      and(
        eq(campaignTargets.campaignId, params.campaignId),
        eq(campaignTargets.agencyId, params.agencyId),
        eq(campaignTargets.deliveryStatus, "pending"),
      ),
    )

  if (pendingTargets.length === 0) {
    return {
      campaignId: params.campaignId,
      sent: 0,
      skipped: 0,
      failed: 0,
      outcomes: [],
    }
  }

  // 3. Charger les contacts (contactRef = l'adresse email/téléphone)
  const contactIds = pendingTargets.map((t) => t.contactId)
  const contactRows = await tx
    .select({ id: contacts.id, contactRef: contacts.contactRef })
    .from(contacts)
    .where(inArray(contacts.id, contactIds))

  const contactMap = new Map(contactRows.map((c) => [c.id, c.contactRef]))

  // 4. Livraison par canal
  const outcomes: DeliveryOutcome[] = []
  const message = campaign.message ?? ""

  for (const target of pendingTargets) {
    const contactRef = contactMap.get(target.contactId) ?? ""
    let status: DeliveryStatus = "skipped"
    let code: string | undefined
    let error: string | undefined

    if (campaign.channel === "email") {
      try {
        await sendCampaignEmail({
          to: contactRef,
          campaignName: campaign.name,
          message,
          agencyName: params.agencyName,
        })
        status = "sent"
      } catch (err) {
        status = "failed"
        error = err instanceof Error ? err.message : String(err)
      }
    } else if (campaign.channel === "whatsapp") {
      // Les messages sortants initiés par l'entreprise sur WhatsApp
      // EXIGENT un template pré-approuvé dans Meta Business Manager.
      // Tant qu'aucun template de campagne n'est configuré, on skip
      // plutôt que d'envoyer un message qui serait rejeté par l'API.
      status = "skipped"
      code = "TEMPLATE_NOT_CONFIGURED"
    } else {
      // 'call' et tout autre canal non automatisable.
      status = "skipped"
      code = "CALL_NOT_AUTOMATED"
    }

    // Mettre à jour la ligne campaign_targets
    await tx
      .update(campaignTargets)
      .set({
        deliveryStatus: status,
        deliveredAt: status === "sent" ? new Date() : null,
      })
      .where(eq(campaignTargets.id, target.id))

    outcomes.push({ targetId: target.id, contactRef, status, code, error })
  }

  const sent = outcomes.filter((o) => o.status === "sent").length
  const skipped = outcomes.filter((o) => o.status === "skipped").length
  const failed = outcomes.filter((o) => o.status === "failed").length

  return { campaignId: params.campaignId, sent, skipped, failed, outcomes }
}
