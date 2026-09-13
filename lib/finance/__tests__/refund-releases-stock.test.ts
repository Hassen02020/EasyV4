import test from "node:test"
import assert from "node:assert/strict"
import { CANCELLABLE_MODULES } from "../../booking/policy-cancel-core"

/**
 * Certification E2E (Dashboard Operations, cycle Omra) : preuve live qu'un
 * remboursement TOTAL déclenché par le staff (`refundReservation`,
 * lib/finance/refund-actions.ts) ne libérait JAMAIS la capacité retenue
 * (allotment Omra / départ Package / session Activity) — contrairement à
 * l'annulation self-service B2C (`cancelMyPolicyReservation`), qui appelle
 * déjà `releaseStock`. `refundReservation` réutilise maintenant EXACTEMENT
 * la même fonction, exportée depuis `lib/booking/policy-cancel-core.ts`
 * pour cette raison.
 *
 * Ce test garde la décision de périmètre (quels modules ont un stock LOCAL
 * à libérer) — Hôtel/Vol/Transfert en sont volontairement exclus (Hôtel :
 * disponibilité chez myGo, fournisseur externe, rien à libérer localement ;
 * Vol/Transfert n'ont pas de réservation réelle, voir
 * docs/audits/e2e-certification-matrix.md). La preuve DB-mode complète du
 * comportement de `releaseStock()` lui-même (décrémenté à la création,
 * libéré à l'annulation, jamais négatif en cas de double appel concurrent)
 * est déjà couverte par lib/booking/__tests__/policy-cancel.test.ts — ce
 * test-ci garde spécifiquement la LISTE DE MODULES partagée entre les deux
 * appelants (`cancelMyPolicyReservation` et `refundReservation`), pour
 * qu'un futur ajout de module (ex. Vols réels) ne puisse pas oublier
 * silencieusement de libérer son stock au remboursement staff.
 *
 * La preuve end-to-end complète (booking réel → admin valide → admin
 * modifie → admin rembourse → allotment revient à son niveau d'avant,
 * vérifié par requête SQL directe) est reproductible via
 * `e2e/dashboard-operations-omra-lifecycle.spec.ts`, qui a servi à trouver
 * ce défaut (voir son en-tête).
 */

test("CANCELLABLE_MODULES : exactement les 3 modules à stock local (omra/package/activity) — jamais hôtel/vol/transfert", () => {
  assert.deepEqual(
    [...CANCELLABLE_MODULES].sort(),
    ["activity", "omra", "package"],
    "si ce test échoue après l'ajout d'un module, vérifier que lib/finance/refund-actions.ts::refundReservation libère bien son stock au remboursement total, pas seulement lib/booking/policy-cancel-core.ts::cancelMyPolicyReservation (self-service B2C)",
  )
})
