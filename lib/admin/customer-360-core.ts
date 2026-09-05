/**
 * CRM / Customer 360 — vue agrégée d'un lead pour le staff (panneau
 * "Vue 360" dans /admin/support). Assemble uniquement des données déjà
 * réelles et déjà scopées agence : score (lib/crm/lead-scoring-core.ts),
 * réservations candidates (même correspondance email/téléphone que
 * lib/crm/leads-core.ts::searchReservationsForLeadLinkCore), fidélité
 * (lib/loyalty/rewards-core.ts, si une réservation matchée porte un
 * customerId), et historique de conversations (lib/crm/inbox-core.ts).
 *
 * Volontairement PAS de favoris ici : customerFavorites est scopé à
 * `authUserId` (compte Supabase connecté), qu'un lead — simple email/
 * téléphone déclaré — ne porte jamais de façon fiable ; les inventer via
 * un join approximatif risquerait d'afficher les favoris d'un tiers.
 */

import { and, desc, eq, or } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { customers, reservations } from "@/lib/db/schema"
import { getLeadCore, type LeadRow } from "@/lib/crm/leads-core"
import { computeLeadScore, type LeadScore, type LeadScoreRuleMap } from "@/lib/crm/lead-scoring-core"
import { getLoyaltyAccountSummary, type LoyaltyAccountRow } from "@/lib/loyalty/rewards-core"
import { listConversationsCore, type ConversationRow } from "@/lib/crm/inbox-core"

export interface Customer360ReservationRow {
  id: string
  customerId: string
  publicRef: string
  module: string
  status: string
  tndAmount: string
  createdAt: Date
}

export interface Customer360 {
  lead: LeadRow
  score: LeadScore
  reservations: Customer360ReservationRow[]
  loyalty: LoyaltyAccountRow | null
  conversations: ConversationRow[]
}

export async function getCustomer360Core(
  tx: DrizzleTransaction,
  params: { agencyId: string; leadId: string; scoreRules: LeadScoreRuleMap },
): Promise<Customer360 | null> {
  const lead = await getLeadCore(tx, { agencyId: params.agencyId, id: params.leadId })
  if (!lead) return null

  const score = computeLeadScore(lead, params.scoreRules)

  const matchClause = or(
    lead.email ? eq(customers.email, lead.email) : undefined,
    lead.phone ? eq(customers.phone, lead.phone) : undefined,
  )
  const reservationRows = matchClause
    ? await tx
        .select({
          id: reservations.id,
          customerId: reservations.customerId,
          publicRef: reservations.publicRef,
          module: reservations.module,
          status: reservations.status,
          tndAmount: reservations.tndAmount,
          createdAt: reservations.createdAt,
        })
        .from(reservations)
        .innerJoin(customers, eq(customers.id, reservations.customerId))
        .where(and(eq(reservations.agencyId, params.agencyId), matchClause))
        .orderBy(desc(reservations.createdAt))
        .limit(20)
    : []

  // Fidélité : le premier customerId matché porteur d'un compte fidélité
  // réel (un lead peut correspondre à plusieurs customerId — coordonnées
  // ressaisies différemment selon la réservation — jamais un agrégat
  // inventé de plusieurs comptes).
  let loyalty: LoyaltyAccountRow | null = null
  for (const r of reservationRows) {
    loyalty = await getLoyaltyAccountSummary(tx, r.customerId)
    if (loyalty) break
  }

  const allConversations = await listConversationsCore(tx, { agencyId: params.agencyId })
  const conversations = allConversations.filter((c) => c.leadId === params.leadId)
  // Repli par téléphone : une conversation peut exister avant qu'un lead
  // n'ait été créé/lié (voir upsertConversationForInboundCore), donc pas
  // encore marquée leadId — mais reste utile à afficher ici.
  if (conversations.length === 0 && lead.phone) {
    for (const c of allConversations) {
      if (c.contactPhone === lead.phone) conversations.push(c)
    }
  }

  return { lead, score, reservations: reservationRows, loyalty, conversations }
}
