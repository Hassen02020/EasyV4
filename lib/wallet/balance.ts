"use server"

/**
 * Solde wallet agence B2B — sandbox uniquement.
 *
 * Extrait de l'ancien lib/wallet/actions.ts (chantier-49, nettoyage) : ce
 * module opérait sur `wallets`/`wallet_transactions`, un solde que plus
 * aucun flux de rechargement en production ne crédite. Le solde réellement
 * crédité (soumission agence → validation admin) est `agencies.deposit_balance`
 * (`partner_credit_movements`), débité via `debitPartnerCredit`
 * (lib/pro/booking-actions.ts) — voir lib/booking/actions.ts,
 * lib/omra/booking-actions.ts, lib/transfers/actions.ts, etc.
 *
 * Seule `getWalletBalance()` avait un appelant réel (`app/(internal)/pro/
 * sandbox/page.tsx`, via components/pro/wallet-status.tsx) — conservée ici.
 * Les 4 autres fonctions (walletDebitReservation/requestWalletTopUp/
 * validateTopUp/rejectTopUp) n'avaient aucun import réel dans le dépôt
 * (confirmé par grep) et opéraient sur un solde qu'aucun flux ne peut
 * créditer en conditions réelles — supprimées (récupérables via git log si
 * `wallets`/`wallet_transactions` redevient un jour le solde canonique).
 */

import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { withTenantContext, resolveSessionContext } from "@/lib/db/tenant-context"
import type * as schema from "@/lib/db/schema"
import { wallets } from "@/lib/db/schema"

export type WalletActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }

type Db = PostgresJsDatabase<typeof schema>

/** Récupère (ou crée) le wallet d'une agence. */
async function getOrCreateWallet(db: Db, agencyId: string) {
  const existing = await db
    .select()
    .from(wallets)
    .where(eq(wallets.agencyId, agencyId))
    .limit(1)

  if (existing[0]) return existing[0]

  const created = await db
    .insert(wallets)
    .values({ agencyId, balance: "0.000", currency: "TND" })
    .returning()
  return created[0]
}

/**
 * Ne prend pas `agencyId` en paramètre — l'agence est dérivée de la session
 * Supabase courante via `resolveSessionContext()`, jamais du client (évite
 * un IDOR : n'importe quel appelant authentifié pourrait sinon lire le
 * solde de n'importe quelle agence en fournissant son UUID).
 */
export async function getWalletBalance(): Promise<
  WalletActionResult<{ balance: string; currency: string }>
> {
  if (!process.env.DATABASE_URL) return { ok: false, error: "db_unavailable" }

  const session = await resolveSessionContext()
  if (!session.ok || !session.agencyId) {
    return { ok: false, error: "Non authentifié", code: "NOT_AUTHENTICATED" }
  }
  const agencyId = session.agencyId

  const wallet = await withTenantContext(
    { agencyId, userId: session.userId, isSuperAdmin: session.isSuperAdmin },
    (db) => getOrCreateWallet(db as Db, agencyId),
  )
  return { ok: true, data: { balance: wallet.balance, currency: wallet.currency } }
}
