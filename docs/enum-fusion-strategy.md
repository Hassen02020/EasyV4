# Stratégie de Fusion des Enums Dupliqués

## Enums Dupliqués Identifiés

### 1. marginType vs marginTypeV6

**Ancien (schema.ts) :**
```typescript
export const marginType = pgEnum("margin_type", ["percent", "fixed"])
```
- Utilisé dans : `pricingMargins` table
- Valeurs : "percent", "fixed"

**Nouveau (financials.ts) :**
```typescript
export const marginTypeV6 = pgEnum("margin_type_v6", ["percent", "fixed", "hybrid"])
```
- Utilisé dans : `marginRules` table
- Valeurs : "percent", "fixed", "hybrid"

**Décision :** Conserver `marginTypeV6` et renommer en `marginType`
- Valeurs compatibles (percent, fixed)
- Ajout de "hybrid" pour les règles hybrides (% + fixe)

### 2. walletTxType vs walletTxTypeV6

**Ancien (schema.ts) :**
```typescript
export const walletTxType = pgEnum("wallet_tx_type", [
  "CREDIT", "DEBIT", "REFUND", "ADJUSTMENT"
])
```
- Utilisé dans : `walletTransactions` table
- Valeurs : MAJUSCULES

**Nouveau (financials.ts) :**
```typescript
export const walletTxTypeV6 = pgEnum("wallet_tx_type_v6", [
  "credit", "debit", "refund", "adjustment", "commission"
])
```
- Utilisé dans : `walletLedger` table
- Valeurs : minuscules + "commission"

**Décision :** Conserver `walletTxTypeV6` et renommer en `walletTxType`
- Conversion MAJUSCULES → minuscules nécessaire
- Ajout de "commission" pour les commissions Easy2Book

## Plan de Migration

### Étape 1 : Créer la migration Drizzle

```sql
-- Migration margin_type
ALTER TYPE margin_type ADD VALUE IF NOT EXISTS 'hybrid';
-- Pas de renommage nécessaire, on garde margin_type

-- Migration wallet_tx_type
-- 1. Créer le nouvel enum avec les valeurs en minuscules
CREATE TYPE wallet_tx_type_new AS ENUM ('credit', 'debit', 'refund', 'adjustment', 'commission');

-- 2. Convertir les données existantes
ALTER TABLE wallet_transactions 
  ALTER COLUMN type TYPE wallet_tx_type_new 
  USING CASE type
    WHEN 'CREDIT' THEN 'credit'::wallet_tx_type_new
    WHEN 'DEBIT' THEN 'debit'::wallet_tx_type_new
    WHEN 'REFUND' THEN 'refund'::wallet_tx_type_new
    WHEN 'ADJUSTMENT' THEN 'adjustment'::wallet_tx_type_new
  END;

-- 3. Supprimer l'ancien enum
DROP TYPE wallet_tx_type;

-- 4. Renommer le nouvel enum
ALTER TYPE wallet_tx_type_new RENAME TO wallet_tx_type;
```

### Étape 2 : Mettre à jour le code

1. **schema.ts** :
   - Supprimer `marginType` (garder V6)
   - Supprimer `walletTxType` (garder V6)
   - Importer depuis `financials.ts`

2. **financials.ts** :
   - Renommer `marginTypeV6` → `marginType`
   - Renommer `walletTxTypeV6` → `walletTxType`

3. **Imports dans le codebase** :
   - `lib/pro/pricing.ts` : déjà utilise le type, pas de changement
   - `lib/finance/margin-calculator.ts` : changer import de `marginTypeV6` → `marginType`

### Étape 3 : Tests

- Vérifier que les tables `pricingMargins` et `marginRules` fonctionnent
- Vérifier que les tables `walletTransactions` et `walletLedger` fonctionnent
- Tester les conversions de données existantes

## Risques

- **Données existantes** : Conversion MAJUSCULES → minuscules pour wallet_tx_type
- **Compatibilité** : Les applications en production doivent être mises à jour simultanément
- **Rollback** : Prévoir un script de rollback en cas de problème

## Ordre d'exécution

1. Créer la migration Drizzle
2. Exécuter la migration en environnement de test
3. Valider les données après migration
4. Mettre à jour le code (schema.ts, financials.ts, imports)
5. Tester l'application
6. Déployer en production
