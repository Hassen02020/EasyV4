# Easy2Book — Certification financière E2E du moteur Wallet & Settlement

Branche : `audit/e2e-certification`. Scope : le moteur "paiement = alimentation du wallet,
réservation = débit du wallet" implémenté dans cette session (commit `56d3e36` et suivants) —
`lib/finance/customer-wallet.ts`, `lib/payment/reservation-webhook-core.ts`,
`lib/finance/manual-payment-actions.ts`, `lib/pro/booking-actions.ts`,
`lib/finance/refund-logic.ts`, `lib/admin/agencies-actions.ts`.

## 1. Méthode

19 scénarios réels (les 14 demandés + idempotence + rollback, certains scénarios demandés étant
naturellement couverts ensemble — voir §3), exécutés contre une **vraie base Postgres 16 locale**
(RLS forcée, identique à la prod), via les **fonctions réellement exportées par l'application**
(`recordTargetedWalletSettlement`, `debitCustomerWallet`, `creditCustomerWallet`,
`applyReservationRefund`, `debitPartnerCredit`, les fonctions SQL `SECURITY DEFINER`
`set_agency_deposit_balance`/`set_agency_reservation_tolerance`) — **aucun mock**.

Script : `scripts/wallet-financial-certification.ts` (conservé dans le dépôt, rejouable :
`DATABASE_URL=... npx tsx scripts/wallet-financial-certification.ts`). Il reproduit fidèlement le
corps transactionnel réel de `verifyManualPayment`/`adminRechargeWallet`/
`setAgencyReservationTolerance`/`debitPartnerCredit` (même séquence d'appels aux mêmes fonctions
exportées) — seule la résolution session Supabase → profil admin (pure lookup d'auth, pas un
mécanisme financier) est remplacée par un contexte tenant déjà résolu, exactement comme le font déjà
les tests DB-mode existants du dépôt (`lib/finance/__tests__/customer-wallet.test.ts`,
`lib/pro/__tests__/booking-actions.test.ts`).

Toutes les données de test (2 agences, 2 clients, ~13 réservations) ont été nettoyées après
exécution — la base est revenue à son état initial (vérifié : `count(*)=0` sur les 3 tables).

## 2. Verdict

**🟢 19/19 PASS — 0 FAIL.** Aucun défaut trouvé dans le moteur financier lui-même. Le détail
scénario par scénario (avec les montants réels observés) est en §3.

## 3. Matrice PASS/FAIL

| # | Scénario demandé | Résultat | Preuve réelle observée |
|---|---|---|---|
| 1 | Client B2C crée son wallet | ✅ PASS | Solde initial = 0 DT, aucune ligne `wallet_accounts` avant le premier mouvement — création paresseuse confirmée (comportement voulu, pas un défaut). |
| 2 | Alimentation par carte | ✅ PASS | `payments` (psp=paymee, method=card, captured) + `recordTargetedWalletSettlement("online_card")` : crédit 500.00 DT puis débit 500.00 DT dans la **même transaction**, réservation confirmée, solde net 0.00 DT. |
| 3 | Alimentation par virement | ✅ PASS | Réplique du corps réel de `verifyManualPayment` (method=transfer) : `payments.method="transfer"`, `wallet_ledger.metadata.paymentMethod="bank_transfer"`, réservation confirmée. |
| 4 | Alimentation par dépôt bancaire | ✅ PASS | Idem, method=deposit : `payments.method="transfer"` (pas de valeur d'enum dédiée, mapping voulu), `wallet_ledger.metadata.paymentMethod="bank_deposit"` — taxonomie préservée malgré le mapping DB. |
| 5 | Validation staff | ✅ PASS | Gate de rôle réel (`MANUAL_PAYMENT_ALLOWED_ROLES`) : `"agent_excursions"` rejeté, `"manager"` accepté — et les scénarios 3/4 ci-dessus s'exécutent sous un contexte tenant `isSuperAdmin:false` (staff d'agence, pas super_admin), donc sous les mêmes contraintes RLS qu'un vrai appel `verifyManualPayment`. |
| 6 | Crédit wallet | ✅ PASS | `creditCustomerWallet(source:"adjustment")` (mirroir de `adminCreditCustomerWallet`) : +200.00 DT, solde réellement disponible (contrairement au crédit+débit ciblé des scénarios 2-4 qui nette à zéro). |
| 7 | Réservation | ✅ PASS | Réservation 150.00 DT créée, payée par le solde disponible (méthode "Solde Easy2Book" / CUSTOMER_WALLET). |
| 8 | Débit wallet | ✅ PASS | `debitCustomerWallet` direct : 200 DT → 50 DT, réservation confirmée. |
| 9 | Annulation | ✅ PASS | `applyReservationRefund` appelé sur la réservation du scénario 7-8. |
| 10 | Remboursement → retour wallet | ✅ PASS | `wasFundedByAgencyCredit=false` (financée par le wallet client) → crédit `source:"refund"` : 50 DT → 200 DT (retour exact du montant débité). |
| 11 | Vérification du ledger | ✅ PASS | 9 mouvements `wallet_ledger` (catégories recharge/booking/adjustment/refund), **réconciliation exacte** : Σ(crédits) − Σ(débits) = 200.00 DT = solde réel du compte. |
| 12 | Aucune réservation confirmée sans fonds | ✅ PASS | Débit de 1000.00 DT demandé sur un solde de 200 DT → `INSUFFICIENT_FUNDS`, **aucune** ligne `wallet_ledger` créée, réservation reste `pending` (jamais confirmée). |
| IDEM (demandé en complément) | Idempotence | ✅ PASS | Même règlement soumis deux fois (même `idempotencyKey`) : 1ère capture ok, 2ème rejetée par la contrainte DB `payments_capture_idempotency_uniq` (`ALREADY_PROCESSED`), solde inchangé entre les deux, une seule ligne `payments` capturée. |
| ROLLBACK (demandé en complément) | Rollback | ✅ PASS | `payments` inséré puis débit wallet volontairement en échec (solde 0 DT) → transaction Postgres annulée dans son ensemble : **0** ligne `payments` orpheline après coup, réservation reste `pending`. Preuve que l'atomicité credit+debit n'est pas juste documentée mais réellement appliquée par Postgres. |
| 13 | Certification B2B | ✅ PASS (4 sous-scénarios) | Voir détail ci-dessous. |
| 14 | PARTNER_GUARANTEE + tolérance | ✅ PASS (3 sous-scénarios) | Voir détail ci-dessous. |

### Détail scénario 13 — B2B

| Sous-scénario | Résultat | Preuve |
|---|---|---|
| 13a. Recharge du crédit agence | ✅ PASS | `set_agency_deposit_balance()` (seul canal autorisé, RLS `agencies_admin_write`) : 0.000 → 2000.000 DT. |
| 13b. Débit pour une réservation | ✅ PASS | `debitPartnerCredit` : réservation 1200.00 DT → 2000.000 DT → 800.000 DT, mouvement `partner_credit_movements` créé, réservation confirmée. |
| 13c. Remboursement → retour au **crédit agence** (pas au wallet client) | ✅ PASS | `applyReservationRefund` détecte `wasFundedByAgencyCredit=true` (mouvement `partner_credit_movements` de type debit trouvé) → crédite l'agence (800.000 → 2000.000 DT) et **laisse le wallet du client à 0 DT** — la bonne cible, jamais confondue. |
| 13d. Refus si fonds insuffisants | ✅ PASS | Débit de 50 000.00 DT demandé sur un solde de 2000.000 DT → `INSUFFICIENT_FUNDS`, solde inchangé. |

### Détail scénario 14 — PARTNER_GUARANTEE + tolérance

| Sous-scénario | Résultat | Preuve |
|---|---|---|
| 14a. Configuration de la tolérance | ✅ PASS | `set_agency_reservation_tolerance(agencyId, 500.000)` (Master Admin uniquement) → `agencies.reservation_tolerance = 500.000`. |
| 14b. Débit accepté dans la tolérance (solde négatif) | ✅ PASS | `booking_capacity = 2000.000 + 500.000 = 2500.000 DT ≥ 2300.000 DT` demandé → accepté, solde 2000.000 → **−300.000 DT** (temporairement négatif, dans la tolérance) — le CHECK DB `agencies_deposit_balance_floor` (`deposit_balance >= -reservation_tolerance`) est respecté (`-300 ≥ -500`). |
| 14c. Refus au-delà de la tolérance | ✅ PASS | `booking_capacity = -300.000 + 500.000 = 200.000 DT < 400.000 DT` demandé → refusé, solde inchangé à −300.000 DT. |

## 4. Ce que cette certification prouve — et ce qu'elle ne prouve pas

**Prouvé, avec preuve DB réelle :**
- Le modèle "paiement = alimentation, réservation = débit" fonctionne pour les 4 méthodes B2C
  (carte, virement, dépôt, solde) avec la bonne politique de validation par méthode.
- Le remboursement route **toujours** vers la bonne cible (wallet client vs crédit agence) selon
  l'origine réelle du financement — jamais confondu.
- Le ledger est intégralement réconciliable (aucun mouvement silencieux).
- Aucune réservation ne peut être confirmée sans fonds réellement disponibles, côté B2C comme B2B.
- L'atomicité credit+debit et l'idempotence des captures sont **réellement** appliquées par
  Postgres (transaction + contrainte unique), pas seulement documentées en commentaire.
- La tolérance B2B (`PARTNER_GUARANTEE`) autorise un solde temporairement négatif dans une limite
  configurable, avec un plancher dur au niveau DB en défense en profondeur.

**Hors périmètre de cette certification (déjà couvert ailleurs ou nécessitant une session
navigateur réelle) :**
- Le flux HTTP complet (webhook PSP signé, Server Action `verifyManualPayment` avec une vraie
  session Supabase/GoTrue) — testé séparément par `lib/payment/__tests__/reservation-webhook-core.test.ts`,
  `lib/payment/__tests__/paymee-reservation-webhook.test.ts` et par la QA navigateur réelle de cette
  session (checkout affichant les 6 méthodes, capture d'écran).
- La politique d'annulation Omra/Package/Activity (barème de frais, snapshot figé) — hors périmètre
  du moteur financier lui-même, déjà certifiée séparément (Policy Engine, tâches #100-104).
- Les concurrents/races sur un même wallet sous forte charge — `lib/pro/__tests__/booking-actions.test.ts`
  couvre déjà la concurrence B2B (idempotencyKey) ; une charge concurrente dédiée au wallet B2C
  n'a pas été rejouée dans cette session (candidate naturelle pour `scripts/wallet-race-test.ts`).

## 5. Gates

- `npx tsc --noEmit` : 0 erreur (script de certification inclus).
- `npm test` (925 tests, suite complète) : re-vérifié après cette certification, aucune régression
  — le script de certification nettoie intégralement ses propres données et n'affecte aucune table
  partagée avec la suite de tests.
- Script conservé dans `scripts/wallet-financial-certification.ts` pour rejouer cette certification
  à tout moment (avant un prochain changement du moteur financier, par exemple).
