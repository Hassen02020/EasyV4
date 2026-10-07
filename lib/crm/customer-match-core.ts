/**
 * NORMALIZED-MATCHING-01 — rapprochement lead→customer par email/téléphone,
 * NORMALISÉ plutôt que par égalité SQL stricte.
 *
 * Bug réel trouvé en production (VIP-DISTRIBUTION-AUDIT-01, 2026-10-07) :
 * un client `+216 98 140 514` (avec espaces) et un lead `+21698140514`
 * (sans espaces) ne matchaient jamais via `eq()`, malgré un numéro
 * identique — `leads.email`/`leads.phone` et `customers.email`/`phone`
 * sont tous deux stockés BRUTS (tels que saisis), jamais normalisés à
 * l'écriture. Même classe de bug que celui déjà corrigé dans
 * contact-history-core.ts (brut vs normalisé) — mais qui réapparaissait
 * ici car chaque site de rapprochement (`getVipScoreForLeadCore`,
 * `getCustomer360Core`, `searchReservationsForLeadLinkCore`) comparait
 * directement les colonnes brutes, chacun avec sa propre copie du même
 * matchClause.
 *
 * Réutilise EXACTEMENT la normalisation de CONTACT-01
 * (`resolveContactKeyCore`/`normalizePhoneRefCore`, contact-core.ts) —
 * jamais une seconde logique de normalisation divergente. Ne crée ni ne
 * lit la table `contacts` : ce fichier ne fait que normaliser deux
 * chaînes et comparer, il ne relie jamais un lead à un CONTACT-01.
 *
 * Borné à `agencyId` dans tous les cas — jamais un rapprochement
 * cross-agence.
 */

import { eq } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { customers } from "@/lib/db/schema"
import { resolveContactKeyCore, normalizePhoneRefCore } from "./contact-core"

/**
 * Renvoie les `customers.id` de l'agence dont l'email OU le téléphone,
 * une fois normalisés, correspondent à l'email/téléphone fourni — jamais
 * une liste arbitraire si ni l'un ni l'autre n'est fourni (renvoie `[]`,
 * même discipline que `searchReservationsForLeadLinkCore` avant ce
 * chantier : "rien de pertinent à suggérer" plutôt qu'une liste
 * fabriquée).
 */
export async function findMatchingCustomerIdsCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; email?: string | null; phone?: string | null },
): Promise<string[]> {
  if (!params.email && !params.phone) return []

  const normalizedEmail = params.email
    ? resolveContactKeyCore("email", params.email)
    : null
  const normalizedPhone = params.phone
    ? normalizePhoneRefCore(params.phone)
    : null

  const candidates = await tx
    .select({
      id: customers.id,
      email: customers.email,
      phone: customers.phone,
    })
    .from(customers)
    .where(eq(customers.agencyId, params.agencyId))

  const matched = candidates.filter((c) => {
    const emailMatches =
      normalizedEmail !== null &&
      c.email !== null &&
      resolveContactKeyCore("email", c.email) === normalizedEmail
    const phoneMatches =
      normalizedPhone !== null &&
      c.phone !== null &&
      normalizePhoneRefCore(c.phone) === normalizedPhone
    return emailMatches || phoneMatches
  })

  return matched.map((c) => c.id)
}
