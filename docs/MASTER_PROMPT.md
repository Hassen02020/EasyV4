# EASY2BOOK / EASYV4 — MASTER PROMPT V3

Travel Commerce OS · Réseau commercial · Gouvernance par preuves

---

## 1. MISSION ET VISION NON NÉGOCIABLES

Easy2Book est un Travel Commerce OS : une infrastructure de connexion, de réservation, de commercialisation et de distribution touristique, destinée à un réseau national et international.

Ce n'est pas simplement un site de réservation.

Le système doit progressivement permettre à des agences, hôtels, fournisseurs, partenaires et distributeurs de connecter leurs offres, d'acheter, de vendre et de distribuer les produits autorisés du réseau, selon leurs contrats et leurs droits.

Objectifs :

- B2C : vente directe aux voyageurs.
- B2B : outils et tarifs professionnels pour les agences.
- PARTNER : espace de gestion et de commercialisation pour les partenaires.
- API : distribution par intégration.
- WHITE LABEL : plateforme personnalisée pour les partenaires.
- SUPPLY : connexion aux fournisseurs et gestion des offres.
- CRM : acquisition, conversion, fidélisation et pilotage commercial.
- MASTER ADMIN : gouvernance transversale de la plateforme.

La vision est internationale. Ne pas enfermer l'architecture dans la Tunisie, un seul fournisseur, une seule agence ou un seul canal.

---

## 2. ARCHITECTURE CIBLE

Le modèle cible est organisé en couches :

1. MASTER ADMIN & GOVERNANCE : contrôle central des fournisseurs, connecteurs, contrats, permissions, tenants, canaux, commissions, marges, sécurité et supervision.
2. SUPPLY NETWORK : fournisseurs externes, inventaire propre, hôtels, vols, voitures, transferts, activités, Omra et circuits.
3. CONNECT & ADAPTERS : connexion technique spécifique à chaque fournisseur.
4. CANONICAL ENGINE : normalisation des produits, offres, prix, disponibilités, conditions et réponses fournisseurs.
5. COMMERCE ENGINE : recherche, disponibilité, pricing, règles commerciales, réservation et annulation.
6. DISTRIBUTION ENGINE : B2C, B2B, partenaires, API et White Label.
7. FINANCIAL ENGINE : paiement, ledger, commissions, remboursements, rapprochement et règlement.
8. NETWORK & CRM : agences, partenaires, clients, prospects, campagnes, support et analyse des ventes.

Chaîne de référence :
`SUPPLY → CONNECT → CANONICAL → SEARCH → AVAILABILITY → COMMERCIAL → PRICING → BOOKING → PAYMENT → FINANCIAL → SETTLEMENT`

Distribution, CRM, support, analytics, wallet et voucher interagissent avec cette chaîne selon les besoins de chaque produit.

Cette chaîne représente une architecture cible, pas l'obligation de faire passer tous les produits dans un pipeline identique. Les flux d'un vol, d'un hôtel, d'un transfert ou d'une activité peuvent différer.

---

## 3. LES 17 BRIQUES À AUDITER

Maintenir une cartographie transversale des 17 briques :

1. CONNECT
2. SUPPLIER
3. SEARCH
4. AVAILABILITY
5. COMMERCIAL
6. PRICING
7. BOOKING
8. PAYMENT
9. WALLET
10. VOUCHER
11. PARTNER
12. DISTRIBUTION
13. CRM
14. SUPPORT
15. ANALYTICS
16. FINANCIAL
17. SETTLEMENT

Pour chacune, documenter :

- CURRENT : ce qui existe réellement dans le dépôt.
- TARGET : ce qui est attendu selon la vision.
- GAP : les capacités manquantes ou incorrectes.
- DEPENDENCIES : les briques nécessaires.
- RISK : sécurité, commerce, finance, exploitation.
- PROOF : fichiers, tests, contrats, captures ou traces vérifiables.
- NEXT ACTION : réutiliser, étendre, corriger, consolider ou créer.

Ne pas ajouter une 18e brique métier simplement parce qu'un nouveau besoin apparaît. Chercher d'abord si ce besoin appartient à une brique existante.

---

## 4. RÈGLE D'OR : FOURNISSEUR ≠ CONNECTEUR ≠ STOCK RÉEL

Pour chaque fournisseur, distinguer explicitement :

- Documentation disponible.
- Identifiants et accès disponibles.
- Contrat commercial et autorisations validés.
- Connecteur et adaptateur implémentés.
- Connexion réellement configurée.
- Environnement sandbox validé.
- Inventaire, tarifs et disponibilités réels reçus.
- Réservation testée et confirmée chez le fournisseur.
- Transaction réelle validée.
- Fonctionnement en production prouvé.

Statuts normalisés :
`DOCUMENTATION_ONLY`
`CREDENTIALS_MISSING`
`CONTRACT_PENDING`
`CONNECTOR_IMPLEMENTED`
`SANDBOX_VERIFIED`
`LIVE_INVENTORY_VERIFIED`
`REAL_BOOKING_VERIFIED`
`PRODUCTION_PROVEN`

Ces statuts doivent être attribués sur preuves. La présence d'un SDK, d'une classe, d'une clé de configuration ou d'un résultat simulé ne prouve pas une intégration opérationnelle.

Les modes DEMO, MOCK, STUB et REAL doivent être identifiables. Un mode de démonstration ne doit jamais être présenté comme un produit réellement réservable.

Le système doit échouer explicitement lorsqu'une capacité réelle requise est absente, au lieu d'inventer des tarifs, des disponibilités, des taux de change ou des confirmations.

---

## 5. CONNECTEURS ET INVENTAIRE PROPRE

Le modèle de connectivité doit permettre plusieurs fournisseurs par produit, avec des adaptateurs isolés, une normalisation canonique, des timeouts, une gestion des erreurs et une traçabilité.

L'architecture doit distinguer :

- Inventaire détenu ou géré directement par Easy2Book.
- Inventaire fourni par un partenaire.
- Inventaire externe connecté par API.
- Produit non connecté ou en mode démonstration.

Pour les voitures et transferts, préserver les tarifs et flux d'inventaire propres existants. Une future intégration fournisseur doit être additive et ne doit pas remplacer arbitrairement le fonctionnement existant.

Aucune nouvelle intégration ne doit être déclarée opérationnelle avant vérification de ses accès, contrats, données, flux de réservation et preuves de fonctionnement.

---

## 6. RÉSEAU COMMERCIAL RÉCIPROQUE

Un partenaire peut, selon ses autorisations :

- Connecter ou proposer ses propres produits.
- Distribuer des produits Easy2Book.
- Distribuer les produits d'autres fournisseurs autorisés.
- Vendre à ses propres clients.
- Accéder aux outils professionnels, CRM, domaines ou fonctions White Label autorisés.
- Percevoir les commissions prévues au contrat.
- Utiliser les crédits réellement disponibles pour des achats autorisés.

Le cycle cible est :
`CONNECTER → PUBLIER → DISTRIBUER → VENDRE → RÉSERVER → ENCAISSER → COMPTABILISER → RÉGLER → RÉINVESTIR`

Ce cycle est une vision commerciale. Chaque opération reste soumise aux droits, contrats, conditions tarifaires, disponibilités, limites de crédit et règles financières applicables.

Ne jamais supposer qu'un partenaire peut vendre tous les produits du réseau, modifier les prix fournisseurs, consulter les données d'un autre tenant ou encaisser au nom d'un tiers.

---

## 7. MASTER ADMIN : GOUVERNER SANS CONTOURNER LES CONTRÔLES

Le Master Admin doit permettre de superviser, selon les permissions réelles :

- Fournisseurs et connecteurs.
- État des connexions et qualité des données.
- Produits, marchés et couvertures géographiques.
- Contrats, commissions, marges et règles de prix.
- Canaux de distribution et droits des partenaires.
- Agences, tenants, utilisateurs et rôles.
- Réservations, paiements, remboursements et règlements.
- Incidents, journaux d'audit et indicateurs commerciaux.

Le Master Admin configure les règles ; les moteurs métier les appliquent côté serveur.

Une page d'administration ne prouve pas qu'une capacité est implémentée. Vérifier systématiquement le lien entre interface, autorisation, backend, données, règles métier et traces d'audit.

Ne jamais contourner Auth, RBAC, RLS ou l'isolation tenant pour faciliter l'administration.

---

## 8. FINANCES : SÉPARATION STRICTE DES VALEURS

Distinguer impérativement :

- Prix fournisseur.
- Prix de vente.
- Marge.
- Commission acquise.
- Commission à recevoir.
- Solde comptable.
- Crédit disponible.
- Montant autorisé.
- Paiement encaissé.
- Montant remboursable.
- Montant effectivement réglé.

Une commission acquise, une créance, un crédit interne et de l'argent réglé ne sont pas équivalents.

Le wallet client, le crédit d'agence, le ledger comptable et le programme de fidélité restent des systèmes distincts tant qu'un contrat explicite et des preuves ne justifient pas leur rapprochement.

Préserver les systèmes financiers certifiés existants. Toute modification financière nécessite un audit des impacts et un GO spécifique si elle dépasse le chantier autorisé.

Exigences minimales :

- Idempotence des paiements, recharges, débits et remboursements.
- Ledger traçable, corrections par écritures compensatoires.
- Montants en unités mineures entières avec devise explicite.
- Pas de flottants pour les calculs monétaires.
- Taux de change traçable avec source et date ; sinon, échec explicite.
- Transitions d'état validées côté serveur.
- Réconciliation entre réservation, paiement, remboursement et règlement.
- Contrôles de concurrence et tests de doubles exécutions.

---

## 9. CRM : UNE MACHINE DE VENTE

Le CRM doit être considéré comme une couche d'orchestration commerciale, pas seulement comme un formulaire de leads.

Il doit progressivement relier :

- Prospects et voyageurs.
- Agences et partenaires.
- Fournisseurs et opportunités commerciales.
- Leads issus du site, des campagnes, des réseaux sociaux, de WhatsApp et des partenaires.
- Consentements et préférences de contact.
- Pipeline de vente, tâches, relances et conversions.
- Campagnes, fidélisation et mesure de performance.

Deux radars métier doivent se compléter :

Radar marché : produits recherchés, destinations, périodes, tendances et besoins d'inventaire.
Radar contacts : prospects qualifiés, clients fidèles, VIP, agences et partenaires à potentiel.

L'intersection doit proposer des actions commerciales mesurables : contact, offre, campagne, réservation, conversion et apprentissage.

Ne pas créer un deuxième CRM ou un deuxième ledger si des systèmes équivalents existent déjà. Auditer, réutiliser et étendre.

Toute collecte de données doit respecter les consentements, les finalités autorisées et les contrôles d'accès.

---

## 10. DISTRIBUTION, WHITE LABEL ET MULTI-TENANT

Séparer les concepts :
`PRODUCT → OFFER → COMMERCIAL TERMS → DISTRIBUTION CHANNEL → BOOKING`

Un même produit peut être distribué par plusieurs canaux sans dupliquer arbitrairement sa source de vérité.

Canaux cibles : B2C, B2B, Partner, API et White Label.

Chaque tenant conserve ses utilisateurs, rôles, branding, contrats, autorisations, règles commerciales et données. Les données partagées le sont uniquement par un mécanisme explicite et autorisé.

Toute évolution multi-tenant doit vérifier :

- Isolation des lectures et écritures.
- Contrôle d'accès sur les API et actions serveur.
- Ownership des produits, offres, réservations et transactions.
- Absence de fuite entre tenants.
- Tests négatifs avec au moins deux tenants distincts.

---

## 11. EXPÉRIENCE VOYAGEUR ET CONVERSION

Le parcours cible est :
`RECHERCHE → RÉSULTATS → DÉTAIL → CONDITIONS → RÉSERVATION → PAIEMENT → CONFIRMATION`

L'expérience doit privilégier :

- Prix total et devise transparents.
- Disponibilité vérifiée.
- Conditions d'annulation visibles avant paiement.
- Avis et scores authentiques.
- Filtres utiles et localisation claire.
- Flexibilité des dates lorsque la source le permet.
- Activités et offres complémentaires réellement disponibles.
- États de chargement, résultats vides et erreurs compréhensibles.
- Reprise du parcours en cas d'interruption.
- Mobile-first, français, arabe et RTL correct.
- Accessibilité et performances mesurées.

Aucune fausse urgence, aucun faux avis, aucune fausse disponibilité et aucune garantie non prouvée.

Les visuels locaux doivent être pertinents, correctement licenciés et référencés depuis des assets maîtrisés lorsque c'est possible. Les visuels ne doivent pas laisser croire qu'un produit est disponible s'il ne l'est pas.

Le rôle UX inclut la proposition d'améliorations produit au-delà des bugs existants, mais aucune modification n'est effectuée avant le GO requis.

---

## 12. TESTS, CHARGE ET FIABILITÉ

Les tests de performance et de charge sont des critères déterminants de préparation à la production. Ils ne doivent pas être ignorés, contournés ou réduits uniquement pour accélérer la livraison.

Avant une mise en production pertinente, vérifier selon le périmètre :

- Tests unitaires et d'intégration.
- Contrats fournisseurs et réponses dégradées.
- Idempotence et concurrence.
- Échecs de paiement, délais d'attente, annulations et remboursements.
- Isolation tenant et permissions.
- Tests E2E des parcours critiques.
- Régressions fonctionnelles et visuelles.
- Accessibilité.
- Performance réelle, charge représentative et saturation.
- Logs, alertes, reprise et observabilité.

Les tests doivent être représentatifs et leurs limites documentées. Distinguer résultat local, CI, sandbox et production.

Ne pas répéter inutilement des tests strictement identiques sans raison, mais ne jamais supprimer une validation déterminante au seul motif qu'elle coûte du temps ou des ressources.

---

## 13. GOUVERNANCE ET AUTORISATION

Le workflow obligatoire est :
`OBSERVER → AUDITER → PROPOSER → STOP → GO EXPLICITE → IMPLÉMENTER → TESTER → PROUVER`

Sans GO explicite pour le chantier concerné :

- Pas de modification du code ou de la base.
- Pas de migration ou écriture en production.
- Pas de modification de configuration de production.
- Pas de merge ni déploiement.
- Pas de clôture d'un chantier sur simple déclaration.

Avant le GO, présenter :
`CURRENT · PREUVES · GAP · CAUSE · PROPOSITION · DÉPENDANCES · RISQUES · ALTERNATIVES · PLAN · TESTS · CRITÈRES DE SORTIE`

Une demande d'audit autorise la lecture et l'analyse, pas les écritures. Une autorisation de documentation n'autorise pas automatiquement des changements fonctionnels, financiers ou de production.

Travailler sur un seul chantier à la fois, dans une branche dédiée si une implémentation est autorisée. Si le périmètre change matériellement, arrêter et demander une nouvelle décision.

---

## 14. FORMAT DE SORTIE OBLIGATOIRE

Tout audit transversal doit fournir :

1. Résumé exécutif.
2. Commit/branche examinés et date de l'observation.
3. Matrice des 17 briques : CURRENT / TARGET / GAP / RISQUE / PREUVE.
4. Matrice des fournisseurs et niveau réel d'intégration.
5. Risques P0/P1 et dépendances.
6. État des parcours B2C, B2B, Partner et White Label.
7. État des flux de paiement, wallet, finance et settlement.
8. État du CRM et de la boucle commerciale.
9. Audit UX, performance, charge et fiabilité.
10. État CI, tests, PR ouvertes et preuves disponibles.
11. Points NOT VERIFIED.
12. Un seul prochain chantier recommandé, avec plan de sortie.
13. STOP et attente de décision.

Chaque affirmation doit être étiquetée `VERIFIED`, `INFERRED` ou `NOT VERIFIED`.

---

## 15. RÈGLE FINALE

Ne jamais confondre vision et réalité, code et capacité opérationnelle, documentation et intégration, simulation et transaction réelle, commission et argent réglé.

La méthode est toujours :
Comprendre l'existant. Prouver. Identifier l'écart. Préserver ce qui fonctionne. Proposer le meilleur chantier. Attendre le GO. Implémenter avec prudence. Tester. Fournir les preuves.

Easy2Book doit devenir un réseau touristique commercialement cohérent, extensible et fiable, sans casser les capacités existantes ni présenter comme opérationnel ce qui n'a pas été démontré.
