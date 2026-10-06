/**
 * CAMPAIGN-PERSISTENCE-01 — identité, cible et état d'une campagne
 * commerciale dans le temps.
 *
 * Audit de conception dédié (docs/ROADMAP.md) : CAMPAIGN décide "à qui
 * et pour quelle action commerciale" — jamais "quelle offre" (PROMO),
 * "quel prix" (PRICING) ni "quelle réservation" (BOOKING). Ce module
 * n'implémente aucune de ces trois logiques.
 *
 * Cycle de vie strict :
 *   createCampaignCore   → statut 'draft', AUCUNE cible enregistrée.
 *   launchCampaignCore   → calcule l'éligibilité RÉELLE (délègue
 *                          entièrement à `filterAudienceByConsentCore`,
 *                          CAMPAIGN-01), snapshot les contacts éligibles
 *                          dans `campaign_targets`, puis fait passer le
 *                          statut à 'active' — ATOMIQUEMENT, dans la
 *                          même transaction. Une campagne se prépare un
 *                          jour et se lance un autre : le snapshot ne
 *                          doit JAMAIS être pris avant ce moment, sous
 *                          peine de figer une audience qui ne
 *                          correspond plus à l'action commerciale réelle.
 *
 * Idempotence de `launchCampaignCore` : une campagne qui n'est plus
 * 'draft' ne peut pas être relancée (erreur explicite) — jamais un
 * second snapshot silencieux qui écraserait la preuve du premier.
 *
 * CAMPAIGN-EXTENSION-01 — immutabilité du contenu après lancement,
 * décision explicite de l'utilisateur (2026-10-06) : `name`/`objective`/
 * `channel`/`message` ne sont plus modifiables dès que `status !==
 * 'draft'` — une nouvelle version de message exige une NOUVELLE
 * campagne, jamais une édition en place (`updateCampaignCore` refuse
 * explicitement, code `CAMPAIGN_NOT_DRAFT`). `startAt`/`endAt` restent
 * modifiables même après lancement — un planning s'ajuste, le contenu
 * réellement montré non (distinction non posée par l'utilisateur,
 * tranchée ici et signalée explicitement dans le rapport de chantier).
 *
 * PAS un fichier `"use server"` (même convention que consent-core.ts/
 * contact-core.ts/campaign-core.ts).
 */

import { and, eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  campaigns,
  campaignTargets,
  CAMPAIGN_STATUSES,
  type CampaignStatus,
  type CrmChannel,
} from "@/lib/db/schema"
import { filterAudienceByConsentCore } from "./campaign-core"
import type { LeadRow } from "./leads-core"

export { CAMPAIGN_STATUSES }
export type { CampaignStatus }

export interface CampaignRow {
  id: string
  agencyId: string
  name: string
  objective: string | null
  channel: CrmChannel
  message: string | null
  status: CampaignStatus
  startAt: Date | null
  endAt: Date | null
  promoRef: string | null
  createdByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

export async function createCampaignCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    name: string
    objective?: string | null
    channel: CrmChannel
    message?: string | null
    startAt?: Date | null
    endAt?: Date | null
    createdByUserId?: string | null
  },
): Promise<CampaignRow> {
  const [row] = await tx
    .insert(campaigns)
    .values({
      agencyId: params.agencyId,
      name: params.name,
      objective: params.objective ?? undefined,
      channel: params.channel,
      message: params.message ?? undefined,
      startAt: params.startAt ?? undefined,
      endAt: params.endAt ?? undefined,
      status: "draft",
      createdByUserId: params.createdByUserId ?? undefined,
    })
    .returning()

  return {
    ...row!,
    channel: row!.channel as CrmChannel,
    status: row!.status as CampaignStatus,
  }
}

export type UpdateCampaignResult =
  | { ok: true; campaign: CampaignRow }
  | { ok: false; code: "CAMPAIGN_NOT_FOUND" | "CAMPAIGN_NOT_DRAFT" }

/**
 * Seul point d'édition d'une campagne. `name`/`objective`/`channel`/
 * `message` sont REFUSÉS dès que `status !== 'draft'` (CAMPAIGN_NOT_DRAFT)
 * — une nouvelle campagne est le seul moyen de changer le contenu
 * réellement montré après lancement. `startAt`/`endAt` restent
 * acceptés quel que soit le statut.
 */
export async function updateCampaignCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    campaignId: string
    name?: string
    objective?: string | null
    channel?: CrmChannel
    message?: string | null
    startAt?: Date | null
    endAt?: Date | null
  },
): Promise<UpdateCampaignResult> {
  const campaign = await getCampaignCore(tx, {
    agencyId: params.agencyId,
    campaignId: params.campaignId,
  })
  if (!campaign) return { ok: false, code: "CAMPAIGN_NOT_FOUND" }

  const changesFrozenContent =
    params.name !== undefined ||
    params.objective !== undefined ||
    params.channel !== undefined ||
    params.message !== undefined

  if (changesFrozenContent && campaign.status !== "draft") {
    return { ok: false, code: "CAMPAIGN_NOT_DRAFT" }
  }

  const [row] = await tx
    .update(campaigns)
    .set({
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.objective !== undefined
        ? { objective: params.objective }
        : {}),
      ...(params.channel !== undefined ? { channel: params.channel } : {}),
      ...(params.message !== undefined ? { message: params.message } : {}),
      ...(params.startAt !== undefined ? { startAt: params.startAt } : {}),
      ...(params.endAt !== undefined ? { endAt: params.endAt } : {}),
      updatedAt: new Date(),
    })
    .where(eq(campaigns.id, params.campaignId))
    .returning()

  return {
    ok: true,
    campaign: {
      ...row!,
      channel: row!.channel as CrmChannel,
      status: row!.status as CampaignStatus,
    },
  }
}

export async function getCampaignCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; campaignId: string },
): Promise<CampaignRow | null> {
  const [row] = await tx
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, params.campaignId),
        eq(campaigns.agencyId, params.agencyId),
      ),
    )
    .limit(1)

  if (!row) return null
  return {
    ...row,
    channel: row.channel as CrmChannel,
    status: row.status as CampaignStatus,
  }
}

export type LaunchCampaignResult =
  | { ok: true; targetCount: number }
  | { ok: false; code: "CAMPAIGN_NOT_FOUND" | "ALREADY_LAUNCHED" }

/**
 * LE lancement — seul moment où une cible de campagne est figée.
 * Délègue l'éligibilité entièrement à `filterAudienceByConsentCore`
 * (CAMPAIGN-01, qui délègue à son tour à CONTACT-01/CONSENT-01) — ce
 * module ne recalcule jamais lui-même qui est éligible.
 */
export async function launchCampaignCore(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    campaignId: string
    audience: Pick<LeadRow, "id" | "email" | "phone">[]
  },
): Promise<LaunchCampaignResult> {
  const campaign = await getCampaignCore(tx, {
    agencyId: params.agencyId,
    campaignId: params.campaignId,
  })
  if (!campaign) return { ok: false, code: "CAMPAIGN_NOT_FOUND" }
  if (campaign.status !== "draft") {
    return { ok: false, code: "ALREADY_LAUNCHED" }
  }

  const { contacts: eligibilityResults } = await filterAudienceByConsentCore(
    tx,
    {
      agencyId: params.agencyId,
      audience: params.audience,
      channel: campaign.channel,
    },
  )

  const eligibleContacts = eligibilityResults.filter((c) => c.eligible)

  if (eligibleContacts.length > 0) {
    await tx.insert(campaignTargets).values(
      eligibleContacts.map((c) => ({
        campaignId: params.campaignId,
        agencyId: params.agencyId,
        contactId: c.contactId,
        leadIds: c.leadIds,
        consentStatusAtSnapshot: true,
      })),
    )
  }

  await tx
    .update(campaigns)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(campaigns.id, params.campaignId))

  return { ok: true, targetCount: eligibleContacts.length }
}

export interface CampaignTargetRow {
  id: string
  campaignId: string
  contactId: string
  leadIds: string[]
  consentStatusAtSnapshot: boolean
  snapshotAt: Date
}

/** Restitution — lecture seule de la cible figée au lancement, jamais un recalcul. */
export async function listCampaignTargetsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; campaignId: string },
): Promise<CampaignTargetRow[]> {
  const rows = await tx
    .select()
    .from(campaignTargets)
    .where(
      and(
        eq(campaignTargets.campaignId, params.campaignId),
        eq(campaignTargets.agencyId, params.agencyId),
      ),
    )

  return rows.map((r) => ({
    ...r,
    leadIds: r.leadIds as string[],
  }))
}
