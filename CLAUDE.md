Lis docs/MASTER_PROMPT.md et docs/ROADMAP.md avant toute action.
Mode par défaut : lecture seule. Aucune écriture sans GO explicite.
Un seul chantier actif à la fois ; il est indiqué dans ROADMAP.md (section "Chantier actif").

## Décision produit permanente — Devis (Quote), 2026-09-29

Ne JAMAIS reproposer "faut-il un modèle Quote/devis ?" comme question ouverte — la réponse est déjà tranchée par l'utilisateur. Détail complet dans docs/ROADMAP.md (Phase 3, R3-03). Résumé :
- Pas de devis pour l'instant, différé volontairement.
- Quand ce chantier sera repris (sur GO explicite uniquement) : le devis s'applique SEULEMENT à 3 cas — demandes de groupe, transferts, voyage à la carte — flux devis → validation client → facture. Tous les autres modules restent en réservation directe → facture, sans devis.

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
