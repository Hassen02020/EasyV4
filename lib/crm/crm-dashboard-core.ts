/**
 * CRM-DASHBOARD-BLOCK-01 — chiffres CRM de l'accueil admin (/admin).
 *
 * Six compteurs réels, lus sous RLS au contexte de l'agence : demandes
 * reçues (7 j), demandes à traiter (statut 'new'), conversions (30 j),
 * campagnes actives, emails de campagne envoyés (30 j), désinscriptions
 * marketing (30 j). Aucun chiffre n'est estimé ni extrapolé.
 *
 * Pas de `server-only` : testé en live contre Postgres (app_runtime).
 */

import { and, count, eq, gte } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  campaignTargets,
  campaigns,
  leadConsentEvents,
  leads,
} from "@/lib/db/schema"

export interface CrmDashboardStats {
  newLeads7d: number
  leadsToHandle: number
  convertedLeads30d: number
  activeCampaigns: number
  campaignEmailsSent30d: number
  unsubscribes30d: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function crmDashboardCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; now?: Date },
): Promise<CrmDashboardStats> {
  const now = params.now ?? new Date()
  const since7d = new Date(now.getTime() - 7 * DAY_MS)
  const since30d = new Date(now.getTime() - 30 * DAY_MS)
  const { agencyId } = params

  const one = async (q: Promise<{ n: number }[]>) =>
    Number((await q)[0]?.n ?? 0)

  const [
    newLeads7d,
    leadsToHandle,
    convertedLeads30d,
    activeCampaigns,
    campaignEmailsSent30d,
    unsubscribes30d,
  ] = await Promise.all([
    one(
      tx
        .select({ n: count() })
        .from(leads)
        .where(
          and(eq(leads.agencyId, agencyId), gte(leads.createdAt, since7d)),
        ),
    ),
    one(
      tx
        .select({ n: count() })
        .from(leads)
        .where(and(eq(leads.agencyId, agencyId), eq(leads.status, "new"))),
    ),
    one(
      tx
        .select({ n: count() })
        .from(leads)
        .where(
          and(
            eq(leads.agencyId, agencyId),
            eq(leads.status, "converted"),
            gte(leads.convertedAt, since30d),
          ),
        ),
    ),
    one(
      tx
        .select({ n: count() })
        .from(campaigns)
        .where(
          and(eq(campaigns.agencyId, agencyId), eq(campaigns.status, "active")),
        ),
    ),
    one(
      tx
        .select({ n: count() })
        .from(campaignTargets)
        .innerJoin(campaigns, eq(campaigns.id, campaignTargets.campaignId))
        .where(
          and(
            eq(campaignTargets.agencyId, agencyId),
            eq(campaigns.channel, "email"),
            eq(campaignTargets.deliveryStatus, "sent"),
            gte(campaignTargets.deliveredAt, since30d),
          ),
        ),
    ),
    one(
      tx
        .select({ n: count() })
        .from(leadConsentEvents)
        .where(
          and(
            eq(leadConsentEvents.agencyId, agencyId),
            eq(leadConsentEvents.purpose, "marketing"),
            eq(leadConsentEvents.action, "withdrawn"),
            gte(leadConsentEvents.occurredAt, since30d),
          ),
        ),
    ),
  ])

  return {
    newLeads7d,
    leadsToHandle,
    convertedLeads30d,
    activeCampaigns,
    campaignEmailsSent30d,
    unsubscribes30d,
  }
}
