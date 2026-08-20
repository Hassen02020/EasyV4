# Easy2Book — Audit du câblage UI + logique métier — Rapport final

Audit complet des 4 espaces (Public, Pro/B2B, Admin, Mutuelle) : boutons/liens/formulaires
inertes, et vérification croisée des 4 flux métier critiques nommés dans la mission.

---

## A. Checklist — Espace Public (`/`)

| # | Statut | Élément | Fichier | Détail |
|---|---|---|---|---|
| 1 | ❌ Mort | 7 liens rapides du footer ("Vols", "Hôtels Tunisie", "Hôtels Monde", "Omraty", "Voyages", "Transferts", "Location voiture") | `components/footer.tsx:147-163` | `href="#"` |
| 2 | ❌ Mort (assumé) | Bouton "Télécharger le voucher (bientôt)" | `app/booking/confirmation/[ref]/page.tsx:135-138` | `disabled` permanent, libellé l'admet |
| 3 | ❌ Mort (assumé) | Boutons "Voucher PDF" / "Facture PDF" / "Annuler" sur `/bookings` | `app/bookings/page.tsx:283-309` | Tous `disabled`, texte : *"seront disponibles prochainement"* |
| 4 | 🗑️ Code mort orphelin | Header "Tunisiabeds" (ACCUEIL/HÔTELS/APPARTEMENTS/...) | `components/booking-form.tsx:117-131` | `href="#"`, mais composant **non importé nulle part** — safe à supprimer |
| 5 | ✅ Réel | Bouton "Réserver" sur les cards hôtel | `hotel-card.tsx` → `hotel-listings.tsx` → `/booking` → `/booking/checkout` | Chaîne mécanique réelle, **mais échoue à la soumission finale pour un vrai visiteur anonyme** — voir Flux #4 ci-dessous |
| 6 | ✅ Réel (corrigé ce soir) | Recherche hôtel publique | `app/hotels/search`, `/api/hotels/search-public` | Corrigé dans cette session (voir `EASYV4_B2C_PUBLIC_SEARCH_REPORT.md`) |

## B. Checklist — Espace Pro/B2B (`/pro`, `/b2b`)

C'est l'espace avec le plus grand volume d'UI inerte — une bonne partie du "back-office"
partenaire est un squelette visuel avec des mocks explicitement commentés "phase 9".

| # | Statut | Élément | Fichier | Détail |
|---|---|---|---|---|
| 1 | ❌ Mort | Sidebar "Activités" / "Formules" | `components/pro/layout.tsx:127,133` | badge `"Bientôt"` |
| 2 | ❌ Mock | Formulaire "Inviter" (gestion utilisateurs) | `components/pro/users-manager.tsx:67-88` | `setTimeout` + état local uniquement, toast *"(mock — phase 9)"* — **le guard d'accès a été corrigé cette session (owner-only), mais l'action elle-même reste un mock** |
| 3 | ❌ Mock | "Supprimer" utilisateur | `components/pro/users-manager.tsx:96-99` | Idem, local uniquement |
| 4 | ❌ Mock | Formulaire "Marges" | `components/pro/margins-form.tsx:85-93` | Commentaire explicite : *"sera Server Action sur pricing_margins en phase 9"* |
| 5 | ❌ Mock | Formulaire "Établissement" | `components/pro/etablissement-form.tsx:87-95` | Idem, *"sera un Server Action lié à agencies en phase 9"* |
| 6 | ❌ Mock | Formulaire "Changer mot de passe" | `components/pro/change-password-form.tsx:48-66` | *"sera Supabase auth.updateUser en phase 9"* — n'appelle jamais réellement `auth.updateUser` |
| 7 | 🗑️ Mort + orphelin | `components/pro/reservations-table.tsx` | — | Dropdown 100% inerte, ET composant non importé nulle part (superseded par `partner-reservations-table.tsx`) |
| 8 | ✅ **Corrigé ce soir** | Dropdown réservations "Consulter/Imprimer/Proforma/Annulation" | `components/pro/partner-reservations-table.tsx` (live `/pro/reservations`) | "Annulation" et "Télécharger le voucher" **branchés à du réel** ; "Consulter"/"Imprimer devis"/"Facture proforma" restent volontairement désactivés (hors périmètre des 3 flux critiques) |
| 9 | ✅ **Corrigé ce soir** | Dropdown factures "Télécharger PDF" | `components/pro/invoices-table.tsx` (live `/pro/factures`) | Toujours pas de génération PDF facture (voir Flux #2) — non corrigé, documenté ci-dessous |
| 10 | ❌ Mort | "Générer un rapport" | `components/pro/ledger-report.tsx:190-193` (live `/pro/releve-compte`) | Aucun `onClick` |
| 11 | ⚠️ Fixture | Catalogue hôtel `/pro/hotels` | `lib/pro/hotels-fixture.ts` | Déjà documenté comme risque P1 séparé (`EASYV4_HOTEL_SEARCH_ENGINE_REPORT.md`) — non touché ici |
| 12 | ✅ **Corrigé ce soir** | Recharge wallet absente de `/pro/paiements` | `app/pro/(app)/paiements/page.tsx` | Formulaire réel (`WalletRechargeForm`) désormais intégré, plus besoin de connaître `/b2b/wallet` |
| 13 | ✅ Réel | Table paiements (historique) | `components/pro/payments-table.tsx` | DB-backed, aucun contrôle mort |
| 14 | ✅ Réel | Table clients | `components/pro/clients-table.tsx` | Liens `tel:`/`mailto:` légitimes |
| 15 | ℹ️ Harnais de test | `/pro/sandbox` | `app/pro/sandbox/page.tsx` | Auto-documenté comme harnais UI, pas d'auth requise — normal pour un sandbox de dev |

## C. Checklist — Espace Admin (`/admin`)

| # | Statut | Élément | Fichier | Détail |
|---|---|---|---|---|
| 1 | ❌ Mock | Page "Catalogue Produits" entière | `app/admin/products/page.tsx` | `MOCK_PRODUCTS` codé en dur |
| 2 | 🔗 Lien mort | "Nouveau produit" | `app/admin/products/page.tsx:174-179` | Pointe vers `/admin/products/new` — **route inexistante (404)** |
| 3 | ❌ Mock | Dashboard "Comptabilité" (onglets paiements/factures) | `app/admin/accounting/page.tsx:52-101` | `MOCK_PAYMENTS`/`MOCK_INVOICES` |
| 4 | ❌ Mort | "Ce mois" / "Export" | `app/admin/accounting/page.tsx:176-183` | Aucun `onClick` |
| 5 | ❌ Mock | Page "Logs" entière + boutons "Filtrer"/"Rafraîchir" | `app/admin/logs/page.tsx` | `MOCK_LOGS`, boutons sans `onClick` |
| 6 | 🐛 Bug réel | Dashboard marges | `app/admin/analytics/margins/page.tsx:58-59` | `getMarginKPIs("agency-id", …)` — **chaîne littérale codée en dur**, commentaire `// TODO: Remplacer avec l'agencyId réel` — interroge toujours la mauvaise agence |
| 7 | ❌ Mort | Dropdown réservations "Modifier/Confirmer/Annuler" | `app/admin/b2c/reservations/page.tsx:447-472` | Aucun `onClick` |
| 8 | 🔗 Lien mort | "Voir détails" réservation | `app/admin/b2c/reservations/page.tsx:448-453` | Pointe vers `/admin/b2c/reservations/[id]` — **route inexistante** |
| 9 | ✅ Réel | Validation/rejet recharges | `app/admin/accounting/recharges/page.tsx` + `components/admin/recharge-actions.tsx` | Seul flux admin financier entièrement réel trouvé |
| 10 | ✅ Réel | Dashboard finance | `app/admin/finance/page.tsx` | DB-backed |

## D. Checklist — Mutuelle (`/mutuelle`)

| # | Statut | Élément | Détail |
|---|---|---|---|
| 1 | ❌ Mock intégral | Dashboard entier | `app/mutuelle/page.tsx` — `MOCK_STATS`/`MOCK_DOSSIERS`, aucune requête DB. Produit isolé, hors périmètre de correction ce soir (confirmé secondaire dans l'audit précédent) |

---

## E. Les 4 flux critiques — verdict et correctifs livrés

### 1. Annulation + remboursement — ❌ absent → ✅ **corrigé**

**Avant** : `getMyGoClient().cancelBooking()` n'était utilisé qu'en compensation interne
best-effort (`lib/booking/actions.ts:551`, rollback silencieux si l'écriture DB échoue
juste après confirmation myGo) — **aucun bouton UI, sur aucun des 3 espaces, ne pouvait
déclencher l'annulation d'une réservation déjà confirmée**.

**Après** :
- `lib/booking/cancel-actions.ts::cancelHotelReservation()` (nouveau) — annulation réelle :
  1. Vérifie l'auth partenaire + le statut annulable (`confirmed`/`pending`/`on_request`)
  2. Appelle `getMyGoClient().cancelBooking()` (hors transaction DB, I/O réseau)
  3. Sous verrou `SELECT ... FOR UPDATE` (même pattern que `debitPartnerCredit`) : calcule
     `remboursement = montant payé − frais myGo`, crédite le wallet via
     `set_agency_deposit_balance()` (seul canal autorisé — jamais `tx.update(agencies)`),
     insère un mouvement `partner_credit_movements` de type **`refund`** (jamais de
     suppression/modification du débit d'origine), passe la réservation à `cancelled`.
  4. Garde-fou anti double-annulation concurrente (re-vérification du statut sous verrou).
- Câblé dans `components/pro/partner-reservations-table.tsx` : bouton "Annulation" (dropdown)
  → `AlertDialog` de confirmation → `useTransition` + toast succès/erreur → `router.refresh()`.
- **Portée volontairement limitée** au module hôtel avec un vrai `providerBookingId` myGo —
  toute autre réservation (module non-hôtel, ou issue du flux fixture `/pro/hotels` sans
  vraie confirmation myGo) reçoit une erreur explicite plutôt qu'un remboursement inventé.

### 2. Documents financiers (factures + vouchers) — ⚠️ partiellement corrigé

**Facture PDF** : **non corrigé**, documenté honnêtement. `lib/finance/invoice-actions.ts`
génère un enregistrement financier réel (`partner_invoices`, montants, TVA) mais ne génère
**aucun PDF** — confirmé par son propre commentaire de tête ("aucune librairie de rendu PDF
générique n'est installée... l'export PDF téléchargeable reste à construire séparément").
Construire un template de facture PDF sans spécification (règles de facturation tunisiennes,
mentions légales obligatoires, taux de TVA — actuellement TVA=0 partout, non modélisé
ailleurs) aurait été une décision produit inventée, hors périmètre de cet audit.

**Voucher PDF hôtel** : ✅ **corrigé**. Le rendu existait déjà (`lib/pdf/voucher-hotel.tsx`,
`@react-pdf/renderer`) mais n'était invoqué qu'une fois, en tâche de fond, pour l'email de
confirmation — jamais stocké nulle part (`reservations.voucherUrl` existe en base mais n'est
jamais rempli), donc aucun téléchargement à la demande n'était possible même avec un bouton
câblé. Nouvelle route `GET /api/pro/reservations/[id]/voucher` (nouveau) : re-génère le PDF
à la demande à partir des données déjà stockées (déterministe, pas de stockage de fichier
nécessaire), tenant-scopée (`withTenantContext`), streamée avec
`Content-Disposition: attachment`. Câblée dans `partner-reservations-table.tsx` ("Télécharger
le voucher", lien direct, module hôtel uniquement).

### 3. Wallet B2B (demande → approbation) — ✅ déjà réel, gap d'exposition **corrigé**

- **Approbation admin** (`app/admin/accounting/recharges/page.tsx` +
  `components/admin/recharge-actions.tsx`) : déjà entièrement réelle, `validateRechargeRequest`/
  `rejectRechargeRequest`, `useTransition`, gestion d'erreur — rien à corriger.
- **Demande partenaire** (`components/b2b/wallet-recharge-form.tsx`, `submitRechargeRequest`) :
  déjà entièrement réelle — **mais seulement accessible via `/b2b/wallet`**, pas depuis `/pro`
  (le portail principal, `/pro/paiements` n'affichait qu'un historique en lecture seule sans
  aucun moyen de soumettre une nouvelle demande). **Corrigé** : le même formulaire réel est
  désormais intégré directement dans `/pro/paiements`, sans dupliquer le composant.

### 4. B2C Checkout — boutons "Réserver" qui échouent silencieusement — ✅ confirmé, corrigé ce soir (recherche), booking reste à traiter séparément

Vérification précise de `lib/booking/actions.ts::createReservationFromDraft` (lignes 188-209) :
```ts
if (!user) return { ok: false, error: "Non authentifié" }
const profile = await getCurrentPartnerProfile(user.id)
if (!profile) return { ok: false, error: "Profil partenaire introuvable" }
```
**Confirmé** : un visiteur B2C anonyme qui clique "Réserver" traverse mécaniquement toute la
chaîne UI (card → draft encodé → `/booking` → `/booking/checkout`, aucune page ne redirige en
amont), mais **échoue systématiquement à la soumission finale** — soit "Non authentifié" (pas
de session), soit "Profil partenaire introuvable" (session existante mais sans agence
partenaire). C'est exactement le gap déjà documenté ce soir sous **WALLET-02**
(`WALLET_PAYMENT_AUDIT_REPORT.md`) et de nouveau dans `EASYV4_B2C_PUBLIC_SEARCH_REPORT.md` (§18,
risque #3) — **non retraité ici** : la recherche B2C a été corrigée dans cette session (voir
plus haut), mais construire un vrai flux de réservation B2C (comptes clients, pricing B2C
distinct, checkout sans wallet partenaire) est un chantier produit à part entière, hors
périmètre "3 correctifs les plus critiques" de cette mission — masquer ou rediriger ces boutons
pour un visiteur non connecté est une option pragmatique à trancher séparément (pas fait ici
pour ne pas retirer une fonctionnalité sans décision produit explicite).

---

## F. Fichiers modifiés

**Nouveaux** :
- `lib/booking/cancel-actions.ts` — `cancelHotelReservation()`.
- `app/api/pro/reservations/[id]/voucher/route.ts` — téléchargement voucher à la demande.
- `EASYV4_UI_WIRING_AUDIT_REPORT.md` (ce document).

**Modifiés** :
- `components/pro/partner-reservations-table.tsx` — action "Annulation" réelle (dialog de
  confirmation + `useTransition` + toast), action "Télécharger le voucher" réelle ; "Consulter"/
  "Imprimer devis"/"Facture proforma" laissés explicitement `disabled` (non traités).
- `app/pro/(app)/paiements/page.tsx` — formulaire de demande de recharge réel intégré.

**Non touchés** : tout le reste des dizaines d'éléments morts listés en sections A-D — chacun
documenté avec sa localisation exacte pour un traitement dans une itération dédiée, hors des
"3 flux les plus critiques" explicitement demandés.

## G. Tests / validation

- `pnpm typecheck` / `pnpm lint` (0 erreur) / `pnpm build` — clean.
- `pnpm test` — 228/228 (aucune régression). Pas de nouveau test unitaire pour
  `cancelHotelReservation` (dépend de DB + appel myGo réel, même limite que
  `adminRechargeWallet`/`validateRechargeRequest` qui n'ont pas de couverture unitaire dédiée
  non plus) — vérifié uniquement via `typecheck`/`build` et lecture croisée du code, faute
  d'environnement authentifié avec réservation myGo réelle dans ce sandbox.
- **BLOCKED — validation E2E réelle** : nécessite une réservation hôtel confirmée avec un vrai
  `providerBookingId` myGo (donc `MYGO_LOGIN` configuré + une réservation passée en conditions
  réelles) pour tester l'annulation/remboursement et le téléchargement voucher de bout en bout.
  Non disponible dans ce sandbox — même limite que documentée dans les rapports précédents de
  cette session.
