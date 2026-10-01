Lis docs/MASTER_PROMPT.md et docs/ROADMAP.md avant toute action.
Mode par défaut : lecture seule. Aucune écriture sans GO explicite.
Un seul chantier actif à la fois ; il est indiqué dans ROADMAP.md (section "Chantier actif").

## Décision produit permanente — Devis (Quote), 2026-09-29

Ne JAMAIS reproposer "faut-il un modèle Quote/devis ?" comme question ouverte — la réponse est déjà tranchée par l'utilisateur. Détail complet dans docs/ROADMAP.md (Phase 3, R3-03). Résumé :

- Pas de devis pour l'instant, différé volontairement.
- Quand ce chantier sera repris (sur GO explicite uniquement) : le devis s'applique SEULEMENT à 3 cas — demandes de groupe, transferts, voyage à la carte — flux devis → validation client → facture. Tous les autres modules restent en réservation directe → facture, sans devis.

## Incident résolu — DEPLOY-01 : `main` → Vercel Production cassé, ouvert 2026-09-29, résolu 2026-09-29

Depuis le commit `72032224`, aucun push vers `main` ne déclenchait de déploiement Vercel sur `easy2book-new` (le projet de production réel — les autres projets Vercel connectés au même repo, `claudegolive`/`easyv4`/`easyv4-golive`, ne sont PAS des cibles de production). Cause exacte non confirmée ; ticket support Vercel préparé et remis à l'utilisateur.

**Preuve de résolution** : merge de la PR #59 sur `main` (commit `d86a3a2d20a8bcf3bf8ce7402f15b993ad615110`) → déploiement Vercel `dpl_C32RD3TofRbiytXd96FoJc5jqbuS` sur `easy2book-new`, `state=READY`, `target=production`, `githubCommitSha=d86a3a2d...` = HEAD(main) au moment du merge, aliasé sur `easy2book-new.vercel.app`. Inspector : https://vercel.com/easy2book/easy2book-new/C32RD3TofRbiytXd96FoJc5jqbuS. C'est exactement le critère de preuve défini ci-dessous lors de l'ouverture de l'incident.

**Conséquence** : les chantiers clos avant cette résolution et étiquetés `TESTED / READY FOR PRODUCTION — NOT YET DEPLOYED` (dont PR #59 elle-même) sont maintenant effectivement en Production sur `easy2book-new` depuis ce déploiement — à confirmer chantier par chantier si besoin, mais le pipeline `main` → Production est de nouveau opérationnel à partir de ce commit.

**Règle qui avait été appliquée pendant l'incident (référence historique)** :

- Chantiers non bloqués par l'incident ; travail normal (audit, dev, tests, commits, PR, doc).
- Chaque chantier clos pendant cette période marqué `TESTED / READY FOR PRODUCTION — NOT YET DEPLOYED` plutôt que "DONE" tant que non confirmé en Production.
- Preview Deployments utilisés pour validation visuelle.
- Aucun déploiement Production manuel sans GO explicite.
- Résolution actée uniquement sur preuve d'un déploiement `state=READY`, `target=production`, `SHA=HEAD(main)` sur `easy2book-new` — jamais sur une reconnexion ou un déploiement manuel.

---

## RÈGLE OPÉRATIONNELLE ABSOLUE

Claude Code ne doit jamais commencer automatiquement le prochain chantier simplement parce que le chantier précédent est terminé.

Pour chaque chantier :

### 1. OBSERVE

- état réel de `main`
- commits / PR déjà réalisés
- production
- migrations réellement appliquées
- tests existants
- fichiers réellement concernés

### 2. AUDITE

- déterminer si le chantier est réellement nécessaire ;
- rechercher les implémentations existantes ;
- rechercher les doublons ;
- rechercher les régressions et dépendances ;
- classer l'état : `REUSE | EXTEND | FIX | CONSOLIDATE | CREATE | N/A`.

### 3. PROPOSE

Présenter UNE SEULE fiche chantier :

```text
ID:
OBJECTIF:
ÉTAT AUDIT:
CE QUI EXISTE:
CE QUI MANQUE:
POURQUOI MAINTENANT:
DÉPENDANCES:
FICHIERS / DOMAINES:
CHANGEMENTS DB:
RISQUES:
PLAN DE RETOUR:
TESTS:
CRITÈRE DE SORTIE:
ESTIMATION:
```

Puis :
→ STOP — ATTENTE DU GO

### 4. APRÈS GO UNIQUEMENT

- créer la branche dédiée ;
- implémenter ;
- déléguer les audits/tests indépendants à des sous-agents lorsque cela accélère le travail sans réduire le contrôle ;
- exécuter les tests pertinents ;
- vérifier les régressions ;
- vérifier le build ;
- vérifier la cohérence DB ;
- vérifier la production lorsque nécessaire ;
- produire le rapport.

### 5. CLÔTURE

- mettre à jour `ROADMAP.md` ;
- marquer le chantier terminé uniquement avec preuves ;
- documenter les `NOT VERIFIED` ;
- identifier le prochain chantier potentiel ;
- NE PAS l'exécuter.

Retour au point 1.

## RÈGLE ANTI-REFACTORING INUTILE

Avant toute création :

`SEARCH → VERIFY → REUSE → EXTEND → FIX → CONSOLIDATE → CREATE`

`CREATE` est le dernier choix.

Claude doit rechercher :

- code existant ;
- tables existantes ;
- migrations existantes ;
- services existants ;
- composants existants ;
- tests existants ;
- PR/commits historiques ;
- implémentations déjà déployées.

Une fonctionnalité déjà correctement implémentée ne doit jamais être reconstruite uniquement parce qu'elle apparaît encore dans la roadmap historique.

## RÈGLE DE RÉCONCILIATION DE LA ROADMAP

`ROADMAP.md` est un plan de travail, pas une preuve de l'état du système.

Lorsqu'une tâche de la roadmap semble déjà réalisée :

1. vérifier `main` ;
2. identifier le commit/PR ;
3. vérifier les fichiers ;
4. vérifier la migration DB ;
5. vérifier les tests ;
6. vérifier le déploiement si pertinent ;
7. classer : `DONE / REUSE / EXTEND / FIX / CONSOLIDATE / N/A / NOT VERIFIED`.

Aucune tâche ne doit être recommencée uniquement parce que son statut historique est `?`.

## RÈGLE DE PRODUCTION

Une vérification de production en lecture seule peut être effectuée pour établir le CURRENT.

Toute écriture en production nécessite :

- justification ;
- analyse du risque ;
- mécanisme de rollback ;
- données explicitement identifiées ;
- GO explicite lorsque l'opération constitue une modification du système ou des données.

Une vérification empirique avec un échantillon insuffisant ne doit pas être présentée comme une preuve statistique de fiabilité.

## RÈGLE FINANCIÈRE

Pour tout changement touchant : wallet · ledger · payment · booking financier · commission · margin · settlement · refund · currency · `amount_*`,

Claude doit vérifier les invariants avant de modifier les lectures ou écritures.

Une migration de double-écriture doit suivre :

`WRITE BOTH → OBSERVE → COMPARE → PROVE → SWITCH READ → OBSERVE → REMOVE OLD PATH`

et non :

`WRITE BOTH → SWITCH READ immédiatement`.

### Règle permanente — Taux de change, 2026-10-01

Un prix financier ne doit JAMAIS être calculé avec un taux inventé, un taux de repli codé en dur, ou un taux prévu uniquement pour l'affichage (ex. un sélecteur de devise cosmétique côté client). Si aucun taux de change réel et traçable (source, horodatage) n'est disponible pour une conversion, le code doit refuser explicitement l'opération concernée (erreur/exclusion de l'offre) plutôt que de produire un montant financier avec un taux fabriqué — précédent : `CURRENCY-DIM-01a` (2026-10-01, `lib/hotels-monde/supplier-drivers.ts`, PR #94), où `convertRateHawkAmountToTnd()` réutilisait le taux statique du sélecteur de devise d'affichage (`lib/currency.ts`) pour une conversion financière réelle.

Discipline de séquencement associée, à réappliquer pour tout futur chantier de ce type : d'abord fermer le trou (neutraliser le risque avec un correctif minimal, fail-safe plutôt que silencieux), puis seulement ensuite construire la route complète (le vrai mécanisme, sur fiche et GO séparés) — jamais l'inverse.

## RÈGLE DE DÉLÉGATION

Claude peut utiliser des sous-agents pour accélérer :

- audit indépendant ;
- recherche de doublons ;
- analyse de migrations ;
- audit tests ;
- audit sécurité ;
- audit UX ;
- vérification documentaire.

Mais : les sous-agents observent, analysent et rapportent ; l'agent principal reste responsable de la décision et de l'intégration.

Deux sous-agents ne doivent pas modifier simultanément le même domaine critique ou les mêmes fichiers sans stratégie explicite de coordination.

## RÈGLE FINALE

À tout moment, il ne peut exister qu'un seul :

`CHANTIER ACTIF`

et un seul état :

`EN ATTENTE DE GO`

Claude ne doit jamais transformer automatiquement :

`DONE → NEXT CHANTIER → EXECUTION`

mais :

`DONE → AUDIT NEXT → PROPOSITION → STOP → GO → EXECUTION`.
