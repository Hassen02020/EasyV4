/**
 * CANCEL-COMMISSION-01 — Reversement de commission Easy2Book lors d'une annulation.
 *
 * Deux opérations comptables dans la même transaction appelante :
 *
 *  A. `debit_platform_commission()` (SQL SECURITY DEFINER, migration 0133) :
 *     débite wallet_accounts.current_balance et insère une ligne
 *     wallet_ledger (type='adjustment', category='fee', amount=-montant).
 *     Idempotent via p_idempotency_key = 'commission-reversal:{reservationId}'.
 *
 *  B. INSERT economic_entitlements compensatoire (qualification='commission',
 *     partyType='easy2book', amount négatif) pointant vers la ligne d'origine
 *     via compensatesId — append-only par construction (0092).
 *
 * IDEMPOTENCE DE BOUT EN BOUT (correctif Bloquant A, audit PR #200) :
 *   L'idempotency key SQL (étape A) protège le wallet contre un double débit,
 *   mais ne protège PAS, seule, l'insertion B — un appel répété voyait A
 *   correctement ignoré et B quand même exécuté une seconde fois (ligne
 *   compensatoire dupliquée, sans mouvement wallet correspondant). Ce fichier
 *   vérifie maintenant explicitement qu'aucune compensation n'existe déjà
 *   (`compensatesId`) avant toute écriture. Cette vérification SELECT puis
 *   INSERT dans la même transaction ne ferme pas la fenêtre de course entre
 *   DEUX transactions concurrentes — fermée par la contrainte UNIQUE partielle
 *   `economic_entitlements_compensates_uniq` (migration 0134, préparée mais
 *   PAS appliquée en production par cette session). Le second INSERT
 *   concurrent, bloqué par cette contrainte, est intercepté ici (23505) et
 *   traité comme un no-op — jamais une erreur remontée à l'appelant.
 *
 * POLITIQUE D'ANNULATION — AUCUN DÉFAUT SILENCIEUX (correctif Bloquant B,
 * audit PR #200) :
 *   La version précédente faisait `cancellationTreatment ?? "full_reversal"`.
 *   Audit du dépôt entier (2026-10-12) : AUCUN call site n'écrit jamais
 *   `cancellationTreatment` à la création d'un entitlement de commission —
 *   100% des réservations existantes et futures (tant qu'un chantier séparé
 *   ne branchera pas cette écriture) ont `cancellationTreatment IS NULL`.
 *   `?? "full_reversal"` n'était donc pas un repli pour un cas rare : c'était
 *   la politique RÉELLE et UNIQUE appliquée à 100% des annulations, décidée
 *   silencieusement par un défaut technique plutôt que par la Direction.
 *
 *   Cette fonction appelle désormais cette fonction sans jamais inventer de
 *   politique : `cancellationTreatment` absent ou non reconnu → reversement
 *   SAUTÉ (pas de débit, pas de compensation), averti via un tag distinct
 *   (`COMMISSION_REVERSAL_POLICY_UNDEFINED`), SANS jamais lever d'exception.
 *
 *   CHOIX DÉLIBÉRÉ de ne PAS lever d'exception sur politique absente, bien
 *   que la demande d'audit le suggère : cette fonction est appelée DANS LA
 *   MÊME TRANSACTION que l'annulation elle-même (voir tous les call sites —
 *   lib/booking/cancel-actions.ts, customer-cancel-actions.ts,
 *   policy-cancel-core.ts, lib/admin/actions.ts, lib/finance/refund-actions.ts,
 *   lib/vols/flight-refund-on-failure.ts). Lever une exception ici ferait
 *   échouer la transaction ENTIÈRE — la réservation ne serait PAS annulée, le
 *   remboursement n'aurait PAS lieu — pour 100% des annulations de la
 *   plateforme, puisque 100% des entitlements ont `cancellationTreatment
 *   NULL` aujourd'hui. Row CLAUDE.md règle 1 : une décision financière qui
 *   nécessite un arbitrage Direction doit être arrêtée et documentée, pas
 *   décidée unilatéralement avec un rayon d'impact aussi large sans GO
 *   explicite. TODO CANCEL-COMMISSION-POLICY-01 reste BLOQUANT — voir rapport
 *   d'audit : Direction doit définir la politique par module avant qu'un
 *   writer ne commence à renseigner `cancellationTreatment` à la création.
 *   `pro_rata_fee` continue de lever une exception (comportement préexistant,
 *   conservé tel quel) — SANS writer connu aujourd'hui, donc sans le même
 *   rayon d'impact, mais soumis au même risque architectural si un futur
 *   writer l'active sans revoir ce point.
 *
 * MONTANT — ARITHMÉTIQUE DÉCIMALE EXACTE (Bloquant C, item 6) :
 *   `negateDecimalString()` inverse le signe d'une chaîne decimal(14,2) par
 *   manipulation de chaîne pure, sans jamais passer par un `number`
 *   JavaScript — élimine tout risque d'erreur de représentation binaire
 *   (ex. 1.005.toFixed(2) peut produire un résultat inattendu selon la valeur).
 *
 * PLUSIEURS CRÉDITS CANDIDATS (Bloquant C, item 8) :
 *   `wallet_ledger.reservationId` n'est PAS unique (pas de contrainte DB,
 *   vérifié dans lib/db/schema/financials.ts). Si plusieurs lignes
 *   type='commission'/category='commission' existaient pour la même
 *   réservation, un `.limit(1)` sans ORDER BY choisirait un résultat
 *   arbitraire. On récupère désormais jusqu'à 2 lignes : >1 → ambigu, on
 *   s'abstient (jamais un choix arbitraire).
 *
 * COMMISSIONS DÉJÀ RÉGLÉES (section 7 de l'audit) — comportement confirmé,
 * inchangé : `debit_platform_commission()` débite `wallet_accounts.current_balance`
 * SANS jamais consulter `commission_settlements`/`settled_at` — le settlement
 * (lib/finance/commission-settlement.ts) ne déplace jamais `current_balance`,
 * il ne fait que marquer des lignes `wallet_ledger` comme comptabilisées dans
 * un lot. Débiter reste donc comptablement correct même pour une commission
 * déjà settlée — mais l'argent déjà versé lors d'un settlement PASSÉ (virement
 * réel hors de ce ledger) n'est jamais récupéré automatiquement par ce débit.
 * Limitation déjà documentée par SETTLE-CANCEL-GUARD-01
 * (commission-settlement.ts:48-50) : "ne récupère pas une commission déjà
 * settlée avant l'annulation... chantier de recovery séparé sur GO Direction."
 * Cette fonction ne crée AUCUN débit rétroactif au-delà du solde wallet
 * courant — RÈGLE FINANCIÈRE respectée.
 *
 * DÉCISION COMMERCIALE REQUISE (TODO CANCEL-COMMISSION-POLICY-01) :
 *   Direction doit valider full_reversal / pro_rata_fee / non_refundable par
 *   produit/module avant qu'un writer ne renseigne `cancellationTreatment`
 *   à la création d'un entitlement de commission.
 */

import { and, eq, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  economicEntitlements,
  reservationFinancials,
  walletLedger,
} from "@/lib/db/schema"
import { pgErrorCode } from "@/lib/db/pg-error"
import { PLATFORM_COMMISSION_WALLET_ID } from "./platform-commission"

const KNOWN_TREATMENTS = [
  "full_reversal",
  "pro_rata_fee",
  "non_refundable",
] as const
type CancellationTreatment = (typeof KNOWN_TREATMENTS)[number]

/**
 * Inverse le signe d'une chaîne decimal(14,2) ("15.50" → "-15.50",
 * "-3.00" → "3.00") par manipulation de chaîne pure — jamais de passage par
 * un `number` JavaScript, donc aucun risque d'arrondi binaire pour un montant
 * financier. `amount` provient toujours d'une colonne decimal(14,2) réelle
 * (jamais une valeur arbitraire) : le format est garanti (signe optionnel,
 * chiffres, point, 2 décimales).
 */
function negateDecimalString(amount: string): string {
  const trimmed = amount.trim()
  if (trimmed.startsWith("-")) return trimmed.slice(1)
  if (trimmed.startsWith("+")) return "-" + trimmed.slice(1)
  if (trimmed === "0.00" || trimmed === "0") return trimmed
  return "-" + trimmed
}

export async function reverseCommissionOnCancellation(
  tx: DrizzleTransaction,
  params: {
    reservationId: string
    publicRef: string
    actorUserId: string | null
  },
): Promise<void> {
  const { reservationId, publicRef } = params

  // ── 1. Garde rapide : commissionAmount dans reservation_financials ──────────
  const [finRow] = await tx
    .select({ commissionAmount: reservationFinancials.commissionAmount })
    .from(reservationFinancials)
    .where(eq(reservationFinancials.reservationId, reservationId))
    .limit(1)

  if (!finRow) return // Réservation antérieure au chantier 37A — no-op
  const earlyAmount = parseFloat(finRow.commissionAmount ?? "0")
  if (earlyAmount <= 0) return // Aucune commission enregistrée

  // ── 2. Entitlement d'origine — preuve comptable + politique ───────────────
  // Sans entitlement on ne peut pas connaître la politique ni vérifier que
  // la commission a bien été comptabilisée. On s'abstient (conservateur).
  const [originalEntitlement] = await tx
    .select({
      id: economicEntitlements.id,
      cancellationTreatment: economicEntitlements.cancellationTreatment,
    })
    .from(economicEntitlements)
    .where(
      and(
        eq(economicEntitlements.reservationId, reservationId),
        eq(economicEntitlements.qualification, "commission"),
        eq(economicEntitlements.partyType, "easy2book"),
      ),
    )
    .limit(1)

  if (!originalEntitlement) {
    console.warn(
      JSON.stringify({
        tag: "COMMISSION_REVERSAL_NO_ENTITLEMENT",
        reservationId,
        earlyAmount,
        ts: new Date().toISOString(),
      }),
    )
    return
  }

  // ── 3. Politique d'annulation — AUCUN DÉFAUT INVENTÉ ───────────────────────
  // TODO CANCEL-COMMISSION-POLICY-01 : Direction doit confirmer par module
  // avant qu'un writer ne renseigne ce champ à la création. Absent/inconnu →
  // reversement sauté, jamais une politique choisie par ce code.
  const rawTreatment = originalEntitlement.cancellationTreatment
  if (
    rawTreatment === null ||
    !KNOWN_TREATMENTS.includes(rawTreatment as CancellationTreatment)
  ) {
    console.warn(
      JSON.stringify({
        tag:
          rawTreatment === null
            ? "COMMISSION_REVERSAL_POLICY_UNDEFINED"
            : "COMMISSION_REVERSAL_POLICY_UNKNOWN",
        reservationId,
        entitlementId: originalEntitlement.id,
        rawTreatment,
        note: "TODO CANCEL-COMMISSION-POLICY-01 — Direction doit définir la politique. Reversement sauté, PAS de full_reversal par défaut.",
        ts: new Date().toISOString(),
      }),
    )
    return
  }
  const treatment = rawTreatment as CancellationTreatment

  if (treatment === "pro_rata_fee") {
    // REJECT : Direction n'a pas défini ni validé le calcul pro_rata.
    // On ne choisit pas automatiquement une politique financière non validée.
    // Lever une exception force une investigation manuelle. Aucun writer
    // connu aujourd'hui ne positionne cette valeur (vérifié par audit) — le
    // rayon d'impact de ce throw est donc nul en pratique actuellement.
    throw new Error(
      `COMMISSION_REVERSAL_PRO_RATA_NOT_VALIDATED: reservationId=${reservationId} — ` +
        `Direction doit définir et valider la règle pro_rata_fee avant déploiement ` +
        `(TODO CANCEL-COMMISSION-POLICY-01).`,
    )
  }

  // ── 4. Idempotence de bout en bout — compensation déjà existante ? ────────
  // Vérifie AVANT toute écriture si cet entitlement d'origine a déjà été
  // compensé (par cet appel précédent, un retry, ou un appel concurrent déjà
  // committé). Un SELECT puis INSERT ne ferme pas la fenêtre de course entre
  // deux transactions concurrentes — fermée par la contrainte UNIQUE
  // economic_entitlements_compensates_uniq (migration 0134), interceptée plus
  // bas (23505) si cette vérification la rate.
  const existingCompensations = await tx
    .select({
      id: economicEntitlements.id,
      cancellationTreatment: economicEntitlements.cancellationTreatment,
    })
    .from(economicEntitlements)
    .where(eq(economicEntitlements.compensatesId, originalEntitlement.id))
    .limit(2)

  if (existingCompensations.length > 1) {
    // Ne devrait jamais arriver après application de la contrainte UNIQUE
    // (migration 0134) — défensif, on ne choisit jamais arbitrairement.
    console.warn(
      JSON.stringify({
        tag: "COMMISSION_REVERSAL_AMBIGUOUS_COMPENSATION",
        reservationId,
        entitlementId: originalEntitlement.id,
        count: existingCompensations.length,
        ts: new Date().toISOString(),
      }),
    )
    return
  }
  if (existingCompensations.length === 1) {
    const existing = existingCompensations[0]!
    if (existing.cancellationTreatment === treatment) {
      // Retry idempotent véritable — déjà traité avec les mêmes paramètres.
      return
    }
    // Même réservation, nouvelle tentative, mais la politique résolue
    // maintenant diffère de celle déjà enregistrée — incohérence à
    // investiguer manuellement, jamais une correction silencieuse.
    throw new Error(
      `COMMISSION_REVERSAL_INCONSISTENT_RETRY: reservationId=${reservationId} ` +
        `compensationId=${existing.id} previousTreatment=${existing.cancellationTreatment} ` +
        `newTreatment=${treatment} — paramètres incompatibles entre deux appels ` +
        `pour la même réservation, investigation manuelle requise.`,
    )
  }

  if (treatment === "non_refundable") {
    // Commission méritée même en annulation : PAS de débit wallet.
    // Insertion traçabilité uniquement (amount=0.00).
    try {
      await tx.insert(economicEntitlements).values({
        reservationId,
        partyType: "easy2book",
        partyId: null,
        role: "easy2book",
        qualification: "commission",
        amount: "0.00",
        currency: "TND",
        basis: `Reversement commission — annulation ${publicRef} (non_refundable — commission conservée)`,
        status: "pending",
        effectiveAt: new Date(),
        compensatesId: originalEntitlement.id,
        cancellationTreatment: "non_refundable",
      })
    } catch (err) {
      if (pgErrorCode(err) === "23505") {
        // Un appel concurrent a déjà inséré cette compensation entre notre
        // vérification (étape 4) et cet INSERT — no-op, jamais une erreur.
        console.warn(
          JSON.stringify({
            tag: "COMMISSION_REVERSAL_RACE_LOST",
            reservationId,
            entitlementId: originalEntitlement.id,
            ts: new Date().toISOString(),
          }),
        )
        return
      }
      throw err
    }
    return
  }

  // ── 5. Vérification du/des crédit(s) réel(s) dans wallet_ledger ──────────
  // Source authoritative du montant : l'écriture réelle dans wallet_ledger
  // (type='commission', category='commission', migration 0066).
  // On ne débite jamais plus que ce qui a été effectivement crédité.
  // `wallet_ledger.reservationId` n'est pas unique (pas de contrainte DB) —
  // on récupère jusqu'à 2 lignes pour détecter une ambiguïté plutôt que de
  // choisir arbitrairement le premier résultat SQL.
  const creditEntries = await tx
    .select({ amount: walletLedger.amount })
    .from(walletLedger)
    .where(
      and(
        eq(walletLedger.walletAccountId, PLATFORM_COMMISSION_WALLET_ID),
        eq(walletLedger.reservationId, reservationId),
        eq(walletLedger.type, "commission"),
        eq(walletLedger.category, "commission"),
      ),
    )
    .limit(2)

  if (creditEntries.length === 0) {
    // Entitlement présent mais aucun crédit correspondant dans wallet_ledger :
    // incohérence à investiguer. On ne débite pas aveuglément.
    console.warn(
      JSON.stringify({
        tag: "COMMISSION_REVERSAL_NO_LEDGER_CREDIT",
        reservationId,
        entitlementId: originalEntitlement.id,
        ts: new Date().toISOString(),
      }),
    )
    return
  }
  if (creditEntries.length > 1) {
    // Plusieurs crédits candidats : on ne choisit jamais arbitrairement le
    // premier résultat SQL. Cas ambigu, investigation manuelle requise.
    console.warn(
      JSON.stringify({
        tag: "COMMISSION_REVERSAL_AMBIGUOUS_CREDIT",
        reservationId,
        entitlementId: originalEntitlement.id,
        candidateCount: creditEntries.length,
        ts: new Date().toISOString(),
      }),
    )
    return
  }

  const creditEntry = creditEntries[0]!

  // ── 6. Montant = crédit wallet réel ───────────────────────────────────────
  const amountToReverse = parseFloat(creditEntry.amount ?? "0")
  if (amountToReverse <= 0) return

  const idempotencyKey = `commission-reversal:${reservationId}`

  // ── A. Débit wallet commission (SECURITY DEFINER, idempotent) ──────────────
  await tx.execute(sql`
    SELECT debit_platform_commission(
      ${PLATFORM_COMMISSION_WALLET_ID}::uuid,
      ${reservationId}::uuid,
      ${amountToReverse}::numeric,
      ${"Reversement commission — annulation " + publicRef},
      ${idempotencyKey}
    )
  `)

  // ── B. Ligne compensatoire economic_entitlements ─────────────────────────
  try {
    await tx.insert(economicEntitlements).values({
      reservationId,
      partyType: "easy2book",
      partyId: null,
      role: "easy2book",
      qualification: "commission",
      amount: negateDecimalString(creditEntry.amount),
      currency: "TND",
      basis: `Reversement commission — annulation ${publicRef} (${treatment})`,
      status: "pending",
      effectiveAt: new Date(),
      compensatesId: originalEntitlement.id,
      cancellationTreatment: treatment,
    })
  } catch (err) {
    if (pgErrorCode(err) === "23505") {
      // Un appel concurrent a gagné la course entre notre vérification
      // (étape 4) et cet INSERT — le débit wallet ci-dessus a déjà été
      // absorbé par l'idempotency key SQL (aucun double débit), seule cette
      // insertion était en course. No-op, jamais une erreur remontée.
      console.warn(
        JSON.stringify({
          tag: "COMMISSION_REVERSAL_RACE_LOST",
          reservationId,
          entitlementId: originalEntitlement.id,
          ts: new Date().toISOString(),
        }),
      )
      return
    }
    throw err
  }
}
