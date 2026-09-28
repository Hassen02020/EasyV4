/**
 * Wallet commission Easy2Book — Chantier 37B.
 *
 * Crédite le compte platform Easy2Book (type=commission) pour chaque
 * réservation confirmée dont la marge porte un taux de commission configuré.
 *
 * Architecture :
 *  - `PLATFORM_COMMISSION_WALLET_ID` : UUID bien connu, seedé en migration 0066.
 *  - `creditPlatformCommission()` appelle `credit_platform_commission()`,
 *    une fonction SQL SECURITY DEFINER qui bypasse le RLS tenant de la
 *    transaction principale — pas besoin d'élever `is_super_admin` dans
 *    la transaction booking elle-même.
 *  - Retour silencieux si `commissionAmount ≤ 0`.
 */

import { sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"

/** UUID du compte wallet platform Easy2Book (migration 0066, idempotent). */
export const PLATFORM_COMMISSION_WALLET_ID = "00000000-e2b0-0000-0000-000000000001"

export async function creditPlatformCommission(
  tx: DrizzleTransaction,
  {
    reservationId,
    commissionAmount,
    description,
  }: {
    reservationId: string
    commissionAmount: number
    description: string
  },
): Promise<void> {
  if (commissionAmount <= 0) return

  await tx.execute(sql`
    SELECT credit_platform_commission(
      ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
      ${reservationId}::uuid,
      ${commissionAmount}::numeric,
      ${description}
    )
  `)
}
