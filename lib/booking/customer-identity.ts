/**
 * PHASE NEXT — CUSTOMER RESERVATION LINK.
 *
 * Point d'entrée UNIQUE pour décider si une réservation guest en cours de
 * création doit être rattachée à un compte client B2C authentifié
 * (`customers.authUserId`, voir app/compte/**, Phase précédente) — jamais
 * une seconde implémentation par module (Hôtel/Omra/Package/Activité), pour
 * ne jamais laisser diverger la règle de sécurité.
 *
 * RÈGLE ABSOLUE (aucune ambiguïté d'identité) : l'identité de la session
 * Supabase n'est JAMAIS déduite du formulaire — elle est résolue côté
 * serveur via le cookie de session (`createServerSupabase().auth.getUser()`,
 * jamais un id fourni par le client) — et n'est renvoyée QUE si l'email
 * vérifié de cette session correspond EXACTEMENT (insensible à la casse) à
 * l'email du voyageur saisi pour CETTE réservation précise.
 *
 * Pourquoi cette égalité stricte : un visiteur peut être connecté à SON
 * compte tout en réservant pour un tiers (email différent dans le
 * formulaire) — ou un ordinateur partagé peut avoir une session ouverte
 * pendant qu'un autre voyageur réserve. Dans les deux cas, rattacher la
 * réservation au compte de la session ouvrirait l'historique d'un client à
 * la réservation d'un autre — exactement l'ambiguïté interdite par la
 * mission. Résultat : `null` (comportement guest inchangé, AUCUN champ
 * `authUserId` renseigné) dès que la correspondance n'est pas exacte, y
 * compris quand personne n'est connecté.
 */

import { eq, and, or, ilike } from "drizzle-orm"
import { createServerSupabase } from "@/lib/supabase/server"
import type { DrizzleTransaction } from "@/lib/db/client"
import { customers } from "@/lib/db/schema"

/**
 * Comparaison stricte, pure — extraite pour être testable indépendamment de
 * tout appel Supabase/réseau (voir lib/booking/__tests__/customer-identity.test.ts).
 * Insensible à la casse et aux espaces superflus, jamais à la présence d'un
 * alias/sous-domaine ("+tag" etc.) : une correspondance PARTIELLE reste un
 * email différent.
 */
export function emailsMatch(
  sessionEmail: string | null | undefined,
  travelerEmail: string | null | undefined,
): boolean {
  if (!sessionEmail || !travelerEmail) return false
  return sessionEmail.trim().toLowerCase() === travelerEmail.trim().toLowerCase()
}

/**
 * Renvoie l'`authUserId` Supabase à associer à cette réservation, ou `null`
 * si aucun rattachement sûr n'est possible (visiteur non connecté, ou email
 * de session ≠ email voyageur). Ne lève jamais — un échec de résolution de
 * session (ex. Supabase indisponible) retombe silencieusement sur `null`
 * (comportement guest), jamais un blocage de la réservation pour une
 * fonctionnalité annexe.
 */
export async function resolveLinkedAuthUserId(
  travelerEmail: string | null | undefined,
): Promise<string | null> {
  if (!travelerEmail) return null
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!emailsMatch(user?.email, travelerEmail)) return null
    return user!.id
  } catch {
    return null
  }
}

/**
 * Condition WHERE partagée : "cette ligne `customers` appartient-elle à la
 * session Supabase courante ?" — UNIQUE définition réutilisée par
 * `app/actions/list-my-reservations.ts` (liste) et
 * `lib/booking/customer-cancel-actions.ts` (vérification avant annulation),
 * pour ne jamais laisser diverger la règle d'accès entre "voir" et "agir
 * sur" une réservation. Toujours scopée par agence (isolation tenant) ET
 * par identité (authUserId OU email vérifié) — jamais l'un sans l'autre.
 */
export function ownedByCurrentCustomer(params: {
  agencyId: string
  authUserId: string
  verifiedEmail: string
}) {
  return and(
    eq(customers.agencyId, params.agencyId),
    or(eq(customers.authUserId, params.authUserId), ilike(customers.email, params.verifiedEmail)),
  )
}

export interface LinkableTraveler {
  civility?: string | null
  firstName: string
  lastName: string
  email: string
  phone?: string | null
  civicId?: string | null
  civicIdType?: string | null
  birthDate?: string | null
  nationality?: string | null
}

/**
 * Find-or-create client B2C — logique UNIQUE réutilisée par
 * `lib/booking/guest-actions.ts` (Hôtel, le seul module qui réutilise une
 * ligne `customers` existante au lieu d'en créer une à chaque réservation).
 * Extraite pour être testable directement contre une vraie transaction DB
 * (voir lib/booking/__tests__/customer-reservation-link.test.ts), sans
 * dépendre d'une session Supabase réelle (`linkedAuthUserId` est un
 * paramètre explicite, déjà résolu par l'appelant via
 * `resolveLinkedAuthUserId`).
 *
 * Comportement `authUserId` :
 *   - Ligne existante (matchée par agencyId+email) : posé UNIQUEMENT si elle
 *     n'en a encore aucun — jamais un écrasement d'une valeur déjà présente,
 *     jamais quand `linkedAuthUserId` est `null`.
 *   - Nouvelle ligne : `authUserId` = `linkedAuthUserId` tel quel (`null`
 *     pour un guest — comportement historique inchangé).
 */
export async function resolveOrCreateLinkedCustomer(
  tx: DrizzleTransaction,
  params: {
    agencyId: string
    traveler: LinkableTraveler
    linkedAuthUserId: string | null
  },
): Promise<string> {
  const { agencyId, traveler, linkedAuthUserId } = params

  const existing = await tx
    .select({ id: customers.id, authUserId: customers.authUserId })
    .from(customers)
    .where(and(eq(customers.agencyId, agencyId), eq(customers.email, traveler.email)))
    .limit(1)

  if (existing[0]) {
    const customerId = existing[0].id
    if (linkedAuthUserId && !existing[0].authUserId) {
      await tx.update(customers).set({ authUserId: linkedAuthUserId }).where(eq(customers.id, customerId))
    }
    return customerId
  }

  const inserted = await tx
    .insert(customers)
    .values({
      agencyId,
      civility: traveler.civility ?? undefined,
      firstName: traveler.firstName,
      lastName: traveler.lastName,
      email: traveler.email,
      phone: traveler.phone ?? undefined,
      civicId: traveler.civicId ?? undefined,
      civicIdType: traveler.civicIdType ?? undefined,
      birthDate: traveler.birthDate || undefined,
      nationality: traveler.nationality || undefined,
      authUserId: linkedAuthUserId,
    })
    .returning({ id: customers.id })
  return inserted[0]!.id
}
