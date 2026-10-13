/**
 * Logique pure (sans React) partagée par `components/admin/
 * supplier-settlement-buttons.tsx` et ses tests — extraite pour pouvoir
 * prouver par un test `node:test` réel (pas d'exécution navigateur requise)
 * que le bouton "Déclarer un règlement" est correctement activé/désactivé
 * selon les dettes reçues, sans dépendre du rendu React/Dialog.
 *
 * Bug trouvé en QA visuelle (2026-10-13) : le bouton restait désactivé sans
 * aucune explication quand `debts` ne contenait aucune créance éligible —
 * comportement VOULU (protège la comptabilité : on ne peut pas déclarer un
 * règlement sans créance réelle), mais invisible pour l'utilisateur, lu à
 * tort comme "le bouton ne marche pas".
 */

import type { SupplierDueEntitlement } from "./supplier-settlement"

/** Une créance est éligible à une déclaration de règlement si elle a
 * effectivement un reste à payer (`remaining > 0`). Un trop-payé seul
 * (`remaining = 0`, `overpaid > 0`) n'est jamais éligible ici — c'est une
 * correction comptable (`CorrectDebtDialog`), pas un nouveau règlement. */
export function getEligibleSupplierDebts(
  debts: SupplierDueEntitlement[],
): SupplierDueEntitlement[] {
  return debts.filter((d) => Number(d.remaining) > 0)
}
