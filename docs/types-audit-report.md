# Audit Report - Types TypeScript
**Date** : 13 Juin 2026
**Projet** : Easy2Book V6

## 1. Utilisation de `any` - CRITIQUE

### Problème
Plusieurs utilisations de `any` dans le code, ce qui compromet la sécurité du typage :

**Dans les services de base de données :**
```typescript
// lib/finance/wallet-service.ts
async function createJournalEntryForDebit(tx: any, options: {...}) { ... }
async function createJournalEntryForCredit(tx: any, options: {...}) { ... }
async function createJournalEntryForMargin(tx: any, options: {...}) { ... }
```

**Dans la pagination :**
```typescript
// lib/admin/pagination.ts
query: any
table: any
const lastItem = actualData[actualData.length - 1] as any
```

**Dans les workflows :**
```typescript
// lib/booking/workflow-pipeline.ts
moduleData: Record<string, any>
metadata?: Record<string, any>
apiPayload: Record<string, any>
```

**Dans les schémas Drizzle :**
```typescript
// lib/db/schema/*.ts
metadata: jsonb("metadata").$type<Record<string, any>>()
```

### Impact
- Perte de la sécurité du typage TypeScript
- Erreurs potentielles non détectées à la compilation
- Difficulté de refactoring
- Autocomplétion IDE non fonctionnelle

### Recommandation
**Immédiat (1 jour)** :
1. Remplacer `tx: any` par le type Drizzle Transaction approprié
2. Créer des interfaces TypeScript pour `metadata` et `apiPayload`
3. Typage fort pour les structures JSON

**Exemple de correction :**
```typescript
// Avant
async function createJournalEntryForDebit(tx: any, options: {...}) { ... }

// Après
import type { DrizzleTransaction } from "@/lib/db/client"
async function createJournalEntryForDebit(
  tx: DrizzleTransaction,
  options: {...}
) { ... }
```

## 2. Interfaces TypeScript vs Schéma Drizzle

### Problème
Les interfaces TypeScript ne sont pas synchronisées avec le schéma Drizzle :

**Exemple 1 : Wallet**
```typescript
// lib/finance/wallet-service.ts
export interface DebitWalletOptions {
  agencyId: string
  amount: number
  description: string
  category?: string
  reservationId?: string
  paymentId?: string
  createdBy?: string
}

// Schéma Drizzle (walletLedger)
{
  walletAccountId: uuid
  type: "credit" | "debit"
  status: "pending" | "completed" | "failed"
  amount: decimal
  balanceBefore: decimal
  balanceAfter: decimal
  description: text
  category: varchar
  reservationId: uuid
  paymentId: uuid
  createdBy: uuid
}
```

**Problème** : L'interface ne correspond pas au schéma Drizzle (champs manquants)

### Impact
- Incohérence entre le code et la base de données
- Erreurs potentielles à l'exécution
- Difficulté de maintenance

### Recommandation
Utiliser les types inférés de Drizzle comme Source of Truth :
```typescript
import type { NewWalletLedger } from "@/lib/db/schema"

export interface DebitWalletOptions extends Omit<NewWalletLedger, 'id' | 'createdAt' | 'updatedAt'> {
  // Champs spécifiques à l'opération
}
```

## 3. Types JSONB Non Typés

### Problème
Les colonnes JSONB utilisent `Record<string, any>` au lieu de types spécifiques :

```typescript
// lib/db/schema/financials.ts
metadata: jsonb("metadata").$type<Record<string, any>>()

// lib/db/schema/audit.ts
oldValues: jsonb("old_values").$type<Record<string, any>>()
newValues: jsonb("new_values").$type<Record<string, any>>()
```

### Impact
- Pas de validation des données JSON
- Erreurs potentielles non détectées
- Difficulté de refactor

### Recommandation
Créer des interfaces TypeScript spécifiques pour chaque JSONB :
```typescript
// lib/db/schema/financials.ts
interface ReservationFinancialMetadata {
  supplierReference?: string
  confirmationId?: string
  cancellationPolicy?: string
  specialRequests?: string[]
}

metadata: jsonb("metadata").$type<ReservationFinancialMetadata>()

// lib/db/schema/audit.ts
interface AuditValues {
  [key: string]: string | number | boolean | null
}

oldValues: jsonb("old_values").$type<AuditValues>()
newValues: jsonb("new_values").$type<AuditValues>()
```

## 4. Interfaces Dupliquées

### Problème
Certaines interfaces sont définies en plusieurs endroits :

**Wallet Debit :**
- `lib/finance/wallet-service.ts` : `DebitWalletOptions`
- `lib/wallet/actions.ts` : `DebitWalletInput`

**Recharge :**
- `lib/finance/recharge-actions.ts` : `SubmitRechargeInput`
- `lib/wallet/actions.ts` : `TopUpRequestInput`

### Impact
- Incohérence potentielle
- Maintenance difficile
- Confusion pour les développeurs

### Recommandation
Centraliser toutes les interfaces dans un fichier `lib/types/index.ts` et importer de là.

## 5. Types de Réponse API Non Typés

### Problème
Les réponses API ne sont pas typées :
```typescript
// lib/mygo/client.ts
private async callOnce<S extends ZodTypeAny>(...) { ... }
```

### Impact
- Pas de validation des réponses API
- Erreurs potentielles non détectées
- Difficulté de debug

### Recommandation
Créer des interfaces TypeScript pour toutes les réponses API et utiliser Zod pour la validation.

## 6. Server Actions Non Typées

### Problème
Les Server Actions n'ont pas de types de retour explicites :
```typescript
// Plusieurs actions dans lib/admin/actions.ts, lib/booking/actions.ts, etc.
export async function someAction(...) { ... } // Pas de type de retour
```

### Impact
- Difficulté de debug
- Erreurs non détectées
- Autocomplétion non fonctionnelle

### Recommandation
Tous les Server Actions doivent avoir un type de retour explicite :
```typescript
export async function someAction(...): Promise<ActionResult<{...}>> { ... }
```

## Plan de Migration Prioritaire

### Étape 1 : Correction Immédiate (1 jour)
1. Remplacer `tx: any` par `DrizzleTransaction`
2. Typage fort pour les structures JSON (metadata, apiPayload)
3. Supprimer les `as any` dans lib/admin/pagination.ts

### Étape 2 : Synchronisation Drizzle (2 jours)
1. Utiliser les types inférés de Drizzle comme Source of Truth
2. Créer des interfaces spécifiques pour les JSONB
3. Supprimer les interfaces dupliquées

### Étape 3 : Centralisation Types (1 jour)
1. Créer `lib/types/index.ts`
2. Centraliser toutes les interfaces
3. Mettre à jour tous les imports

### Étape 4 : Server Actions (2 jours)
1. Ajouter des types de retour explicites
2. Créer un type `ActionResult<T>` standard
3. Mettre à jour toutes les Server Actions

## Conclusion

Le typage TypeScript est partiellement correct mais souffre de :
1. Utilisation excessive de `any` (sécurité compromise)
2. Interfaces non synchronisées avec Drizzle
3. Types JSONB non typés
4. Interfaces dupliquées
5. Server Actions non typées

Une migration progressive est recommandée pour minimiser les risques de rupture.
