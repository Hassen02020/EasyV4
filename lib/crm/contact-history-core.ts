/**
 * CONTACT-LEAD-HISTORY-01 — "LEAD = statut commercial temporaire, CONTACT
 * = identité durable + historique lead conservé" (décision produit,
 * docs/ROADMAP.md).
 *
 * Audit préalable : ce regroupement existait déjà, mais UNIQUEMENT comme
 * sous-produit interne de CAMPAIGN (`filterAudienceByConsentCore`,
 * lib/crm/campaign-core.ts) — il part d'une audience déjà construite par
 * ailleurs et regroupe SES leads par contact, pour une campagne donnée.
 * Rien n'exposait "donne-moi tout l'historique de leads de ce contact,
 * à travers le temps, indépendamment de toute campagne". Ce fichier
 * ferme ce gap, sans toucher à CAMPAIGN ni dupliquer sa logique.
 *
 * Volontairement un fichier séparé de lib/crm/contact-core.ts : ce
 * dernier documente explicitement "ne relie jamais un contact à un
 * lead/customer/person" — une fonction de lecture métier qui relie
 * CONTACT → leads n'a pas sa place dans ce module, qui ne fait que
 * résoudre/normaliser une valeur de contact.
 *
 * Même mapping canal → champ `leads` que resolveContactRefForChannelCore
 * (lib/crm/campaign-core.ts), appliqué dans le sens inverse (CONTACT →
 * leads, au lieu de LEAD → ref) — jamais une seconde logique de mapping
 * divergente. Pour les canaux sans champ équivalent sur `leads`
 * (instagram/messenger/web), retourne toujours un historique vide —
 * jamais une valeur fabriquée.
 *
 * Comparaison après normalisation (resolveContactKeyCore), jamais une
 * égalité SQL directe : `leads.email`/`leads.phone` sont stockés bruts,
 * `contacts.contactRef` est normalisé — comparer les deux sans
 * renormaliser manquerait silencieusement tout lead écrit sous une
 * forme différente (ex. "21620000031" vs "+21620000031").
 */

import { and, asc, eq, isNotNull } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { contacts, leads } from "@/lib/db/schema"
import { resolveContactKeyCore, type CrmChannel } from "./contact-core"
import type {
  LeadRow,
  LeadProductType,
  LeadIntention,
  LeadMarket,
  LeadStatus,
} from "./leads-core"

function castLeadRow(row: typeof leads.$inferSelect): LeadRow {
  return {
    ...row,
    productType: row.productType as LeadProductType,
    intention: row.intention as LeadIntention,
    market: row.market as LeadMarket,
    status: row.status as LeadStatus,
  }
}

/**
 * Historique complet des leads résolus à un CONTACT (CONTACT-01), ordre
 * chronologique croissant — jamais fusionné avec un autre contact, même
 * point de contact brut sur un canal différent (ex. même numéro en
 * `whatsapp` et en `call` restent deux contacts distincts, par
 * conception CONTACT-01).
 */
export async function getContactLeadHistoryCore(
  tx: DrizzleTransaction,
  params: { agencyId: string; contactId: string },
): Promise<LeadRow[]> {
  const [contact] = await tx
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, params.contactId),
        eq(contacts.agencyId, params.agencyId),
      ),
    )
    .limit(1)
  if (!contact) return []

  const channel = contact.channel as CrmChannel
  const field: "email" | "phone" | null =
    channel === "email"
      ? "email"
      : channel === "whatsapp" || channel === "call"
        ? "phone"
        : null
  if (field === null) return []

  // `leads.email`/`leads.phone` sont stockés BRUTS (tels que saisis),
  // contrairement à `contacts.contactRef` qui est normalisé
  // (resolveContactKeyCore) — une égalité SQL directe entre les deux ne
  // matcherait jamais un numéro écrit sous une forme différente (ex.
  // "21620000031" brut vs "+21620000031" normalisé). On récupère donc
  // tous les leads de l'agence portant ce champ, puis on compare après
  // normalisation — même fonction que CONTACT-01 lui-même, jamais une
  // seconde logique de normalisation divergente.
  const rows = await tx
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.agencyId, params.agencyId),
        field === "email" ? isNotNull(leads.email) : isNotNull(leads.phone),
      ),
    )
    .orderBy(asc(leads.createdAt))

  const matching = rows.filter((row) => {
    const raw = field === "email" ? row.email : row.phone
    if (!raw) return false
    return resolveContactKeyCore(channel, raw) === contact.contactRef
  })

  return matching.map(castLeadRow)
}
