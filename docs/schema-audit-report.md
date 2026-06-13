# Audit Report - Drizzle Schema
**Date** : 13 Juin 2026
**Projet** : Easy2Book V6

## 1. Conflit de Schéma Wallet - CRITIQUE

### Problème
Deux systèmes de wallet coexistent :
- **Ancien schéma** : `wallets` + `walletTransactions`
- **Nouveau schéma V6** : `walletAccounts` + `walletLedger`

### Impact
- Duplication de fonctionnalité
- Confusion dans le code (quel schéma utiliser ?)
- Maintenance difficile
- Données potentiellement incohérentes

### Recommandation
**Option A (Recommandée)** : Migrer complètement vers V6
1. Créer un script de migration des données `wallets` → `walletAccounts`
2. Mettre à jour tous les services pour utiliser `walletLedger`
3. Marquer l'ancien schéma comme déprécié
4. Supprimer l'ancien schéma après période de transition (3 mois)

**Option B** : Garder les deux mais séparer les usages
- `wallets` pour les comptes B2B simples
- `walletAccounts` pour la comptabilité avancée (double-entry)
- Non recommandé : complexité accrue

## 2. Tables V6 Non Intégrées

### Problème
Les tables V6 sont créées mais pas utilisées :
- `walletAccounts`, `walletLedger`
- `marginRules`, `reservationFinancials`
- `journalEntries`, `journalLines`
- `products`, `productInventory`
- `apiLogs`, `auditLogs`

### Impact
- Nouvelles fonctionnalités inaccessibles
- Code incohérent
- Investissement perdu

### Recommandation
1. **Phase 1** : Intégrer `marginRules` dans le service de calcul de marge
2. **Phase 2** : Migrer `walletTransactions` vers `walletLedger`
3. **Phase 3** : Activer `journalEntries` pour toutes les transactions financières
4. **Phase 4** : Connecter `apiLogs` aux appels fournisseurs XML

## 3. Manque d'Index sur Clés Étrangères

### Problème
Certaines FK ne sont pas indexées :
- `payments.reservationId`
- `walletTransactions.walletId`
- `walletTransactions.agencyId`
- `reservationFinancials.reservationId`

### Impact
- Requêtes lentes sur jointures
- Problèmes de performance à l'échelle

### Recommandation
Ajouter des index sur toutes les FK :
```typescript
// Dans payments
index("payments_reservation_idx").on(payments.reservationId),

// Dans walletTransactions
index("wallet_tx_wallet_idx").on(walletTransactions.walletId),
index("wallet_tx_agency_idx").on(walletTransactions.agencyId),

// Dans reservationFinancials
index("res_fin_reservation_idx").on(reservationFinancials.reservationId),
```

## 4. Incohérence de Types Décimaux

### Problème
Différentes précisions pour les montants :
- `walletTransactions.amount` : precision 14, scale 3
- `walletLedger.amount` : precision 14, scale 2
- `payments.amount` : precision 14, scale 2

### Impact
- Précision différente
- Erreurs de calcul potentielles
- Arrondis incohérents

### Recommandation
Uniformiser tous les montants financiers à :
```typescript
decimal("amount", { precision: 14, scale: 2 })
```

## 5. Relations Manquantes

### Problème
Certaines relations logiques ne sont pas explicitées :
- `reservations` → `suppliers` (pas de FK direct)
- `products` → `reservations` (pas de lien)
- `marginRules` → `agencies` (FK existe mais pas utilisée)

### Impact
- Requêtes complexes avec JOIN multiples
- Difficulté de maintenance
- Risque d'incohérence

### Recommandation
Ajouter des FK explicites où possible :
```typescript
// Dans reservations
supplierId: uuid("supplier_id").references(() => suppliers.id),

// Dans reservationFinancials
productId: uuid("product_id").references(() => products.id),
```

## 6. Enums Dupliqués

### Problème
Certains enums existent en double :
- `marginType` (ancien) vs `marginTypeV6` (nouveau)
- `walletTxType` (ancien) vs `walletTxTypeV6` (nouveau)

### Impact
- Confusion
- Code incohérent

### Recommandation
Conserver uniquement les enums V6 et migrer l'ancien code.

## Plan de Migration Prioritaire

### Étape 1 : Correction Immédiate (1 jour)
1. Ajouter les index manquants sur les FK
2. Uniformiser les types décimaux (scale 2)
3. Fusionner les enums dupliqués

### Étape 2 : Migration Wallet (1 semaine)
1. Script de migration `wallets` → `walletAccounts`
2. Mise à jour des services wallet
3. Tests de régression
4. Déploiement

### Étape 3 : Intégration V6 (2 semaines)
1. Activer `marginRules` dans le calcul de marge
2. Connecter `journalEntries` aux transactions
3. Intégrer `apiLogs` aux appels fournisseurs
4. Activer `auditLogs` pour toutes les actions

### Étape 4 : Nettoyage (1 semaine)
1. Marquer l'ancien schéma comme déprécié
2. Supprimer les tables inutilisées
3. Documentation mise à jour

## Conclusion

Le schéma Drizzle est globalement bien conçu mais souffre de :
1. Conflit entre ancien et nouveau schéma wallet
2. Tables V6 créées mais non intégrées
3. Manque d'index sur les FK
4. Incohérence de types

Une migration progressive est recommandée pour minimiser les risques de rupture.
