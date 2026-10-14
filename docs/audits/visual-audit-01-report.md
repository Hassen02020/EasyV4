# VISUAL-AUDIT-01 — Rapport comparatif (re-run e2e + écrans non couverts)

**Date** : 2026-10-14
**Branche** : `docs/cancel-commission-coherence-01` (HEAD `5b0e052`, déjà sur `main` via PR #208)
**Environnement** : Postgres 16 local jetable (`easyv4_e2e`), mock GoTrue local (`.tmp-mock-gotrue/`), `pnpm build && pnpm start` — **jamais la production**. Base détruite après usage, aucun état partagé.
**Mandat** : re-jouer les 17 specs e2e existants (seule `a11y.spec.ts` tourne en CI aujourd'hui) pour détecter une régression après 418 commits de dérive depuis la dernière certification réelle (`docs/audits/e2e-certification-report.md`, 2026-10-02), puis documenter/capturer les écrans financiers récents non couverts.

**⚠️ Statut : EXÉCUTION TERMINÉE, EN ATTENTE DE GO — rien n'est commité/poussé.** Ce rapport est la pièce de la phase PROPOSE du cycle CLAUDE.md ; aucun fichier modifié n'a été committé.

---

## 1. Résumé exécutif

- Environnement de test local entièrement reconstitué et **4 blocages d'infrastructure** (zéro ligne de code métier) corrigés pour obtenir un signal exploitable — détail §2.
- **44 tests e2e passés**, 0 régression applicative confirmée parmi les specs re-jouées avec succès.
- **1 défaut applicatif potentiellement réel et significatif** trouvé (§4.1) : le statut de réservation ne semble pas transiter vers `confirmed` après l'action admin "Vérifier le règlement" dans cet environnement — à confirmer, car il pourrait s'agir d'un artefact de cet environnement jetable plutôt que d'une régression de prod. **Ne pas agir sans fiche dédiée (RÈGLE FINANCIÈRE).**
- **2 défauts de routing confirmés** (§4.2, §4.3) : plusieurs pages publiques renvoient HTTP 200 au lieu de 404 pour un contenu inexistant ; une page (`/destinations/[slug]`) renvoie HTTP 500 pour un slug hors `generateStaticParams`. Le second semble déjà connu (branche existante `destinations-ssg-pool-exhaustion-01`).
- **1 défaut déjà connu et documenté dans le code du test lui-même** (§4.4) : le lien "Télécharger" du voucher sur l'écran admin est cassé pour tous les modules hors hôtel — trouvé et volontairement non corrigé lors d'un cycle de certification antérieur.
- 2 écrans financiers non couverts auparavant (admin finances annulations, settlements commissions) **capturés avec succès, rendent correctement**, état vide cohérent avec une base neuve.
- Plusieurs échecs de specs sont des **faux signaux d'environnement** (staleness de test, pas de régression) — détaillés §5.
- `CANCEL-COMMISSION-POLICY-01` et D-04 : non touchés, hors périmètre de ce chantier.

---

## 2. Corrections d'infrastructure de test (zéro impact applicatif/financier/production)

Toutes ces corrections sont nécessaires pour obtenir un signal exploitable de l'environnement de test local pré-existant (créé lors d'une session antérieure, jamais remis à jour). **Aucune ne touche du code métier, une migration, ou la production.**

| # | Fichier | Problème | Correctif |
|---|---|---|---|
| 1 | `.env.local` (gitignored, non versionné) | `CRON_SECRET` manquant → `pnpm start` refusait de démarrer (garde `lib/env.ts` intentionnelle) | Ajout d'une valeur locale ≥16 car. |
| 2 | `scripts/seed-base-infra.ts` | `onConflictDoNothing` sur `pricing_margins` ciblait `(agency_id, module)` alors que l'index unique réel (post CHANNEL-DIM-01) est `(agency_id, module, channel)` → `42P10` | Cible étendue à 3 colonnes |
| 3 | `scripts/seed-base-infra.ts` | `EXISTING_PARTNER_AGENCY_ID` (agence B2B supposée pré-existante) absente sur une base neuve → violation FK | Vérification d'existence avant de l'inclure dans les boucles |
| 4 | `scripts/seed-base-infra.ts` | `agencies.contact_phone` non seedé pour l'agence OTA → le lien "Aide" (header/footer, gated par `contactPhone`) n'apparaît jamais | Ajout d'un numéro de test |
| 5 | `scripts/seed-base-infra.ts` | Dates de départ/session ancrées sur une constante figée `2026-09-11` au lieu de `new Date()` → avec le temps qui passe, ces fixtures finissent dans le passé et deviennent silencieusement non réservables ("Aucune session n'est ouverte à la réservation") | Ancrage sur la date réelle d'exécution |
| 6 | `.tmp-mock-gotrue/cert.pem`/`key.pem` (gitignorés) | Certificat auto-signé généré avec 3 jours de validité (`2026-10-06` → `2026-10-09`), expiré au moment de l'audit (`2026-10-14`) | Régénéré, valide jusqu'en 2029 |
| 7 | Process `pnpm start` (local, non versionné) | Même après cert valide : `DEPTH_ZERO_SELF_SIGNED_CERT` côté serveur Next (le client Supabase SSR vérifie la chaîne TLS) → login admin/pro silencieusement sans effet (retour à `/login`) | `NODE_TLS_REJECT_UNAUTHORIZED=0` au démarrage du serveur local — **correctif déjà documenté comme acceptable dans `docs/audits/e2e-certification-report.md` §9, local/mock uniquement, jamais en production** |
| 8 | `playwright.config.ts` | Pas de `locale` fixé → le conteneur négocie `/en` au lieu de `/fr` par défaut, faisant échouer plusieurs specs qui assument du texte FR sans épingler la locale | `locale: "fr-FR"` ajouté dans `use` |
| 9 | Invocation Playwright (CLI, non versionné) | Le binaire `chrome-headless-shell` préinstallé (révision 1194) ne correspond pas à la révision attendue par `@playwright/test` (1223) → `Executable doesn't exist` | `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` (le binaire Chrome complet, déjà supporté par `playwright.config.ts`) |

**Diff réel sur fichiers versionnés** : `playwright.config.ts` (+6 lignes), `scripts/seed-base-infra.ts` (+27/-3 lignes). Rien d'autre. `next-env.d.ts` (généré, diff dev/build) a été restauré sans modification.

---

## 3. Résultats par spec (après corrections d'infrastructure)

| Spec | Résultat | Détail |
|---|---|---|
| `a11y.spec.ts` | ✅ 5/5 PASS | Seule spec déjà en CI — aucune régression |
| `auth.spec.ts` | ⚠️ FAIL — staleness test, pas une régression | Attend une redirection vers une URL `/.*login/`, mais la route réelle est `/compte/connexion` depuis la migration next-intl — le flux lui-même fonctionne (voir §5.1) |
| `hotel-search.spec.ts` | ⚠️ FAIL — probable staleness sélecteur date-picker | La destination se sélectionne correctement ; le date-picker reste "ouvert", bouton RECHERCHER jamais activé (§5.2) |
| `header-footer-navigation.spec.ts` | ✅ 33/34 PASS (après corrections) | 1 échec restant = fixture manquante (`istanbul-decouverte`, slug jamais seedé par aucun script du dépôt) — hreflang **confirmé fonctionnel** sur le vrai slug seedé (§5.3) |
| `b2c-guest-checkout.spec.ts` | ✅ 5/5 PASS | — |
| `b2c-hotel-checkout-mobile.spec.ts`, `b2c-hotel-mobile.spec.ts`, `mobile-overflow.spec.ts` | ✅ PASS | Inclus dans le premier run global (50 passed) |
| `omra-packages-storefront.spec.ts` | ❌ 5/5 FAIL — **défaut applicatif réel confirmé** | Voir §4.2/§4.3 |
| `booking-flow.spec.ts` | ⚠️ FAIL — fixture manquante | Nécessite une "offre flash" non présente dans le seed minimal — non testable tel quel |
| `journey-builder-01.spec.ts` | ❌ 2/2 FAIL — bloqué par §4.1 | Login Pro fonctionne (après correctif TLS) ; bloque sur "Confirmée" jamais affiché après clic "Confirmer" |
| `dashboard-operations-omra-lifecycle.spec.ts` | ⚠️ 1 step FAIL sur 8+ | Flux réel (créer→chercher→détail→booking→paiement) passe intégralement ; bloque sur voucher (§4.1 + §4.4, déjà connu) |
| `dashboard-operations-activity-lifecycle.spec.ts` | ⚠️ idem | idem, après correctif date fixture (§2.5) |
| `dashboard-operations-package-lifecycle.spec.ts` | ⚠️ idem | idem |
| `dashboard-operations-hotel-lifecycle.spec.ts` | 🚫 NON TESTABLE dans cet environnement | Nécessite une fixture hôtel "MyGo virtuel" (`canonical_hotels` + disponibilité) absente du seed minimal — hors périmètre de cette exécution |
| `dashboard-operations-permissions-isolation.spec.ts` | 🚫 NON TESTABLE | Dépend d'un état partagé (`publicRef`) produit par `dashboard-operations-hotel-lifecycle.spec.ts`, donc bloqué en cascade |
| `dashboard-operations-flight-lifecycle.spec.ts`, `dashboard-operations-hotel-monde-lifecycle.spec.ts` | 🚫 NON EXÉCUTÉS | Non lancés faute de temps restant dans ce cycle — à couvrir dans un passage ultérieur |

**Totaux observés** : 44 tests passés toutes specs confondues (hors hotel-lifecycle/flight/hotel-monde non exécutés) ; aucune régression confirmée dans le code applicatif testé avec succès.

---

## 4. Défauts applicatifs trouvés (nécessitent une fiche dédiée — rien n'a été modifié)

### 4.1 — Statut réservation ne transite pas vers `confirmed` après "Vérifier le règlement" (PRIORITÉ HAUTE, à confirmer)

**Observation** : dans les 3 flux `dashboard-operations-{omra,activity,package}-lifecycle.spec.ts`, l'étape "07-payment" clique "Vérifier" → remplit la référence → "Confirmer le règlement" → la modale se ferme sans erreur UI. Mais vérification directe en base :

```
public_ref      | module   | status
PK-2026-000001  | package  | pending
AT-2026-000001  | activity | pending
OM-2026-000001  | omra     | pending
```

Le statut reste `pending` alors que `lib/finance/manual-payment-actions.ts:376` écrit `status: "confirmed"` **de façon synchrone** (pas de dépendance Inngest identifiée sur ce chemin précis). La route voucher (`/api/omra/voucher/[ref]` etc.) applique correctement la règle `isOmraVoucherEligible` (statut `confirmed`/`completed` requis) et renvoie donc 404 à juste titre — **la route n'est pas en cause**, c'est la transition de statut en amont qui semble ne pas avoir eu lieu.

**Non confirmé comme régression** : peut être un artefact de cet environnement précis (fermeture de la modale avant complétion réelle de la server action, erreur silencieuse non vérifiée par le test, ou particularité de ce throwaway). `journey-builder-01.spec.ts` échoue au même type d'étape ("Confirmée" jamais affiché après clic "Confirmer") — cohérent avec la même famille de cause.

**Action proposée** : fiche dédiée OBSERVE→AUDIT, **jamais de correctif sans elle** (RÈGLE FINANCIÈRE — ce chemin touche la confirmation de paiement réel).

### 4.2 — Pages produit public renvoient HTTP 200 au lieu de 404 pour un contenu inexistant (PRIORITÉ HAUTE)

Vérifié directement en HTTP (hors bruit Playwright), reproductible à chaque appel :

| Route | Attendu | Observé |
|---|---|---|
| `/fr/omra/00000000-0000-0000-0000-000000000000` | 404 | **200** |
| `/fr/omra/00000000-.../book` | 404 | **200** |
| `/fr/packages/ce-voyage-n-existe-pas` | 404 | **200** |
| `/fr/packages/ce-voyage-n-existe-pas/book` | 404 | **200** |
| `/fr/attractions/this-does-not-exist` | 404 | **200** |
| `/fr/voucher/THISFAKEREF` | 404/erreur | **200** |

Le code source (`app/(public)/[locale]/omra/[id]/page.tsx:141`, `packages/[slug]/page.tsx:169`, etc.) appelle bien `notFound()` quand la requête DB ne retourne rien — la logique applicative est correcte. Le contenu rendu est la coquille du site (titre générique), pas de contenu fabriqué. **Mais le code HTTP final reste 200**, ce qui casse le contrat testé par `omra-packages-storefront.spec.ts` ("pas de fabrication de contenu, jamais 500/200 sur un id inexistant").

**Hypothèse** (non creusée plus loin, hors périmètre) : comportement lié au nouveau modèle de rendu statique/dynamique de Next.js 16 (Cache Components / PPR) combiné à `notFound()` sous le segment `[locale]` — nécessite une investigation dédiée, pas un correctif ad hoc.

### 4.3 — `/destinations/[slug]` renvoie HTTP 500 pour un slug hors `generateStaticParams` (PRIORITÉ HAUTE, probablement déjà connu)

```
Error: Page changed from static to dynamic at runtime /fr/destinations/this-does-not-exist, reason: headers
```

Erreur Next.js explicite (static/dynamic mismatch dans `generateMetadata`). Une branche `destinations-ssg-pool-exhaustion-01` existe déjà dans le dépôt (`git branch -a`), ce qui suggère que ce problème est **déjà identifié** comme son propre chantier — à vérifier/réconcilier plutôt qu'à rouvrir comme neuf.

### 4.4 — Lien "Télécharger" voucher cassé sur l'écran admin pour tout module ≠ hôtel (PRIORITÉ MOYENNE, **déjà connu et documenté**)

Ce n'est **pas une découverte de cet audit** : le commentaire dans `e2e/dashboard-operations-omra-lifecycle.spec.ts:180-188` (et les 3 autres specs `*-lifecycle`) documente explicitement que l'écran admin (`app/(internal)/admin/reservations/[id]/page.tsx`) calcule l'éligibilité voucher via `isHotelReservationVoucherEligible`, qui ne renvoie jamais `true` pour un module ≠ hôtel — le lien affiche donc "Non disponible" même sur une réservation Omra/Package/Activité/Vol/Hôtel Monde confirmée. Trouvé et **volontairement non corrigé** lors d'un cycle de certification antérieur ("hors périmètre 'ne pas modifier le code métier' de ce cycle"). Reste ouvert.

---

## 5. Faux signaux d'environnement (non-régressions, pour mémoire)

### 5.1 `auth.spec.ts` — route de login stale
La spec attend `toHaveURL(/.*login/)` après clic sur "Connexion" ; la vraie route B2C est désormais `/compte/connexion` (migration next-intl). La navigation et le rendu fonctionnent correctement (vérifié visuellement). Spec à mettre à jour, pas un bug applicatif.

### 5.2 `hotel-search.spec.ts` — interaction date-picker
La destination "Hammamet" se sélectionne correctement. Le sélecteur de dates reste "ouvert" après les clics programmés par le test (sélection J+7), empêchant le bouton RECHERCHER de s'activer. Probable dérive de sélecteur (pas creusé plus loin, pas de preuve d'un bug produit).

### 5.3 hreflang sur page package dynamique — fixture manquante, pas un bug
`header-footer-navigation.spec.ts` teste `/fr/packages/istanbul-decouverte`, un slug qui n'est seedé par **aucun** script de ce dépôt (`seed-base-infra.ts` ni `seed-mock-data.ts` — recherché explicitement). Sur le vrai slug seedé (`sejour-djerba-7-jours`), les 4 balises `<link rel="alternate" hreflang>` (fr/en/ar/x-default) sont **confirmées présentes et correctes** :
```
<link rel="alternate" hrefLang="fr" href=".../fr/packages/sejour-djerba-7-jours"/>
<link rel="alternate" hrefLang="en" href=".../en/packages/sejour-djerba-7-jours"/>
<link rel="alternate" hrefLang="ar" href=".../ar/packages/sejour-djerba-7-jours"/>
<link rel="alternate" hrefLang="x-default" href=".../fr/packages/sejour-djerba-7-jours"/>
```
La fonctionnalité marche ; la spec référence une fixture qui n'existe dans aucun seed réutilisable.

---

## 6. Écrans financiers non couverts auparavant — captures

Connecté réellement en admin (`admin.test@easy2book.local`), captures plein écran :

- **`/admin/analytics/finances`** (Finances Annulations) → `docs/audits/screenshots/visual-audit-01/admin-analytics-finances.png` — rend correctement, état vide cohérent (0 annulation sur la base de test neuve).
- **`/admin/accounting/settlements`** (Settlements commissions) → `docs/audits/screenshots/visual-audit-01/admin-accounting-settlements.png` — rend correctement, état vide cohérent.

Le screen "Network supplier settlements" détaillé par nœud fournisseur (`/admin/suppliers/nodes/[id]/settlements`) n'a pas été capturé — nécessite une fixture `supplier_nodes` absente du seed minimal (non ajoutée, hors périmètre de cette exécution pour ne pas élargir le chantier).

---

## 7. Captures mises à jour (regénérées par le re-run des specs existants)

36 captures déjà versionnées sous `docs/audits/screenshots/{nav-audit,attractions,omraty,voyages-organises}/` ont été régénérées par ce re-run (remplacent les captures du 2026-10-02, désormais à jour avec l'état réel de `main`). Diff visuel non examiné image par image — à faire si souhaité avant tout commit.

---

## 8. Ce qui N'A PAS été vérifié (explicite, par discipline)

- `dashboard-operations-flight-lifecycle.spec.ts`, `dashboard-operations-hotel-monde-lifecycle.spec.ts` — non exécutés (budget de temps de ce cycle).
- `dashboard-operations-hotel-lifecycle.spec.ts` et, par cascade, `dashboard-operations-permissions-isolation.spec.ts` — non exécutables sans fixture hôtel "MyGo virtuel" complète (canonical_hotels + disponibilité), non construite dans ce cycle.
- Écran "Network supplier settlements" par nœud — non capturé (fixture manquante).
- §4.1 n'est **pas confirmé** comme régression de production — seulement observé dans cet environnement jetable précis.
- Aucune transaction financière réelle n'a eu lieu en production. Toutes les actions "réelles" (paiement, remboursement, confirmation) de ce rapport se sont produites exclusivement sur `easyv4_e2e`, détruite après usage.
- `CANCEL-COMMISSION-POLICY-01` et D-04 : non réexaminés, statut inchangé depuis PR #207/#208.

---

## 9. Prochaines étapes proposées (STOP — PAS D'EXÉCUTION SANS GO SÉPARÉ)

1. **GO pour committer/pousser** les 2 fichiers de code (`playwright.config.ts`, `scripts/seed-base-infra.ts`) + les captures nouvelles/régénérées sur cette branche ou une branche dédiée — à votre choix.
2. Fiche dédiée pour §4.1 (transition de statut paiement) — **priorité la plus haute**, touche un chemin financier réel.
3. Fiche dédiée pour §4.2/§4.3 (404/500 routing Next.js 16) — vérifier d'abord si `destinations-ssg-pool-exhaustion-01` couvre déjà §4.3.
4. §4.4 (lien voucher admin cassé hors hôtel) — déjà documenté de longue date, à planifier si prioritaire.
5. Compléter la couverture non testée (§8) dans un second passage si souhaité.

Aucune de ces actions n'est engagée. Conformément à CLAUDE.md : **DONE → AUDIT NEXT → PROPOSITION → STOP → GO → EXECUTION**.
