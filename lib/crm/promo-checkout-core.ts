/**
 * PROMO-CHECKOUT-CONTEXT-01 — résout si LA promo d'une campagne
 * s'applique à CE client, au moment du checkout, avant paiement.
 *
 * Audit de conception dédié (docs/ROADMAP.md) : un `campaignId`
 * transporté depuis un lien de campagne (URL/brouillon client,
 * non signé) n'est JAMAIS une preuve d'éligibilité — seulement un
 * indice disant "vérifie cette campagne". L'éligibilité réelle est
 * TOUJOURS re-dérivée ici depuis la vérité serveur (le point de
 * contact réel du client, re-résolu via CONTACT-01, comparé à
 * `campaign_targets` déjà figé au lancement) — jamais déduite de la
 * valeur transportée elle-même. Même principe que
 * `lib/booking/price-token.ts` : transporter sans faire confiance,
 * revérifier contre la vérité serveur.
 *
 * Conséquence directe : un `campaignId` fabriqué par un client ne
 * donne jamais rien — il ne correspondra simplement à aucune ligne
 * `campaign_targets` pour le contact réel de ce client.
 *
 * Réutilise la même logique de correspondance que
 * `attributeReservationCore` (CAMPAIGN-ATTRIBUTION-01) et
 * `selectAttributionCandidateCore` pour la règle déterministe en cas
 * de campagnes multiples — jamais une seconde implémentation.
 *
 * PAS un fichier `"use server"` (même convention que les autres
 * modules -core.ts de ce dépôt).
 */

import { and, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  campaigns,
  contacts,
  campaignTargets,
  type CrmChannel,
} from "@/lib/db/schema"
import { resolveContactRefForChannelCore } from "./campaign-core"
import { resolveContactKeyCore } from "./contact-core"
import {
  getPromoForCampaignCore,
  resolveApplicableDiscountCore,
} from "./promo-core"
import type { ApplicableDiscountResult } from "./promo-core"

export type ResolveCheckoutPromoResult =
  | { eligible: true; promoId: string; discount: ApplicableDiscountResult }
  | {
      eligible: false
      reason:
        | "CAMPAIGN_NOT_FOUND"
        | "CAMPAIGN_NOT_ACTIVE"
        | "NO_CONTACT_REF"
        | "NOT_TARGETED"
        | "NO_PROMO"
        | "NOT_APPLICABLE"
    }

/**
 * `campaignId` est un INDICE transporté par le client (lien de
 * campagne) — jamais une autorisation. Le CANAL n'est jamais choisi
 * par l'appelant : il appartient à LA CAMPAGNE (`campaigns.channel`),
 * résolu ici après lecture de la campagne — l'appelant fournit
 * seulement les valeurs brutes du client réel (`email`/`phone`),
 * jamais un canal présupposé. Même mapping canal → champ brut que
 * CAMPAIGN-01 (`resolveContactRefForChannelCore`), jamais une seconde
 * logique.
 */
export async function resolveCheckoutPromoCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    campaignId: string
    email: string | null
    phone: string | null
    at?: Date
  },
): Promise<ResolveCheckoutPromoResult> {
  const [campaign] = await tx
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.agencyId, params.agencyId),
      ),
    )
    .limit(1)
  if (!campaign) return { eligible: false, reason: "CAMPAIGN_NOT_FOUND" }
  if (!["active", "completed"].includes(campaign.status)) {
    return { eligible: false, reason: "CAMPAIGN_NOT_ACTIVE" }
  }
  const channel = campaign.channel as CrmChannel

  const rawRef = resolveContactRefForChannelCore(
    { email: params.email, phone: params.phone },
    channel,
  )
  if (rawRef === null) return { eligible: false, reason: "NO_CONTACT_REF" }

  const contactRef = resolveContactKeyCore(channel, rawRef)

  const [contact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.agencyId, params.agencyId),
        eq(contacts.channel, channel),
        eq(contacts.contactRef, contactRef),
      ),
    )
    .limit(1)
  if (!contact) return { eligible: false, reason: "NOT_TARGETED" }

  const [target] = await tx
    .select({ id: campaignTargets.id })
    .from(campaignTargets)
    .where(
      and(
        eq(campaignTargets.campaignId, params.campaignId),
        eq(campaignTargets.contactId, contact.id),
      ),
    )
    .limit(1)
  if (!target) return { eligible: false, reason: "NOT_TARGETED" }

  const promo = await getPromoForCampaignCore(tx, {
    agencyId: params.agencyId,
    campaignId: params.campaignId,
  })
  if (!promo) return { eligible: false, reason: "NO_PROMO" }

  const discount = resolveApplicableDiscountCore(promo, params.at ?? new Date())
  if (!discount.applicable) {
    return { eligible: false, reason: "NOT_APPLICABLE" }
  }

  return { eligible: true, promoId: promo.id, discount }
}
