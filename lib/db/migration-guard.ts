/**
 * Migration Guard — vérifie l'intégrité du schéma avant toute opération critique.
 *
 * Pattern : avant de traiter un paiement ou une réservation, vérifier que
 * les colonnes Sprint 2 existent bien. Si la migration est incomplète,
 * lever une erreur explicite plutôt que de corrompre silencieusement les données.
 *
 * Usage dans les Server Actions de paiement :
 * ```ts
 * await assertPaymentSchemaReady()
 * // ... logique de paiement
 * ```
 */

import { getDb } from "@/lib/db/client"
import { sql } from "drizzle-orm"

let _schemaReadyCache: boolean | null = null

/**
 * Vérifie que les colonnes de paiement Sprint 2 existent dans `payments`.
 * Résultat mis en cache pour éviter N requêtes par request.
 */
export async function assertPaymentSchemaReady(): Promise<void> {
  if (_schemaReadyCache === true) return

  const db = getDb()

  const result = (await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'payments'
      AND column_name IN ('psp', 'stripe_payment_intent_id', 'sps_transaction_id')
  `)) as Array<{ column_name: string }>

  const found = result.map((r) => r.column_name)
  const required = ["psp", "stripe_payment_intent_id", "sps_transaction_id"]
  const missing = required.filter((c) => !found.includes(c))

  if (missing.length > 0) {
    _schemaReadyCache = false
    throw new Error(
      `[MigrationGuard] Migration Sprint 2 incomplète. Colonnes manquantes: ${missing.join(", ")}. ` +
        `Exécuter 'pnpm db:migrate' avant de traiter des paiements.`,
    )
  }

  _schemaReadyCache = true
}

/**
 * Réinitialise le cache (utile après une migration en dev).
 */
export function resetMigrationGuardCache(): void {
  _schemaReadyCache = null
}
