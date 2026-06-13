# Audit Report - Data Layer
**Date** : 13 Juin 2026
**Projet** : Easy2Book V6

## 1. Appels Directs à la Base de Données - CRITIQUE

### Problème
Les appels Drizzle sont dispersés dans de nombreux fichiers au lieu d'être centralisés dans des services dédiés :

**Fichiers avec appels directs à `getDb()` :**
- `lib/wallet/actions.ts` - 5 appels
- `lib/transfers/actions.ts` - 2 appels
- `lib/reporting/margin-analytics.ts` - 7 appels
- `lib/pro/dashboard-data.ts` - 1 appel
- `lib/pro/partner-data.ts` - 3 appels
- `lib/pro/reservation-detail.ts` - 1 appel
- `lib/pro/reservations-data.ts` - 1 appel
- `lib/pro/users-data.ts` - 1 appel
- `lib/omra/booking-actions.ts` - 2 appels
- `lib/finance/recharge-actions.ts` - 5 appels
- `lib/finance/wallet-service.ts` - 5 appels
- `lib/finance/ledger.ts` - 2 appels
- `lib/booking/actions.ts` - 2 appels
- `lib/booking/inventory.ts` - 5 appels
- `lib/booking/workflow-pipeline.ts` - 1 appel
- `lib/auth/partner-profile.ts` - 1 appel
- `lib/audit/logger.ts` - 2 appels
- `lib/auth/profile.ts` - 1 appel
- `lib/api/auth-guard.ts` - 1 appel
- `lib/admin/actions.ts` - 1 appel
- `lib/admin/agencies-actions.ts` - 2 appels
- `lib/admin/finance-data.ts` - 3 appels
- `lib/admin/reservations-data.ts` - 3 appels
- `lib/admin/dashboard-data.ts` - 1 appel

**Total : 50+ fichiers avec appels directs à la base de données**

### Impact
- Logique métier dispersée
- Difficulté de maintenance
- Risque d'incohérence
- Tests difficiles
- Pas de réutilisation du code

### Recommandation
Créer des services centralisés par domaine métier :

**Structure proposée :**
```
lib/services/
├── wallet/
│   ├── wallet-service.ts (existe déjà)
│   └── wallet-repository.ts (nouveau)
├── reservations/
│   ├── reservation-service.ts (nouveau)
│   └── reservation-repository.ts (nouveau)
├── payments/
│   ├── payment-service.ts (nouveau)
│   └── payment-repository.ts (nouveau)
├── customers/
│   ├── customer-service.ts (nouveau)
│   └── customer-repository.ts (nouveau)
├── agencies/
│   ├── agency-service.ts (nouveau)
│   └── agency-repository.ts (nouveau)
└── reporting/
    ├── analytics-service.ts (nouveau)
    └── analytics-repository.ts (nouveau)
```

**Pattern Repository :**
```typescript
// lib/services/wallet/wallet-repository.ts
import { getDb } from "@/lib/db/client"
import { walletAccounts, walletLedger } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export class WalletRepository {
  private db = getDb()

  async findById(id: string) {
    return this.db.query.walletAccounts.findFirst({
      where: eq(walletAccounts.id, id),
    })
  }

  async findByAgencyId(agencyId: string) {
    return this.db.query.walletAccounts.findFirst({
      where: eq(walletAccounts.agencyId, agencyId),
    })
  }

  async getLedgerEntries(walletAccountId: string, limit = 50) {
    return this.db.query.walletLedger.findMany({
      where: eq(walletLedger.walletAccountId, walletAccountId),
      orderBy: (walletLedger, { desc }) => [desc(walletLedger.createdAt)],
      limit,
    })
  }
}

export const walletRepository = new WalletRepository()
```

**Pattern Service :**
```typescript
// lib/services/wallet/wallet-service.ts
import { walletRepository } from "./wallet-repository"
import { debitWallet, creditWallet } from "@/lib/finance/wallet-service"

export class WalletService {
  async getWalletBalance(agencyId: string) {
    const wallet = await walletRepository.findByAgencyId(agencyId)
    if (!wallet) {
      throw new Error("Wallet not found")
    }
    return Number(wallet.currentBalance)
  }

  async getWalletTransactions(agencyId: string, limit = 50) {
    const wallet = await walletRepository.findByAgencyId(agencyId)
    if (!wallet) {
      throw new Error("Wallet not found")
    }
    return walletRepository.getLedgerEntries(wallet.id, limit)
  }

  async debit(options: DebitWalletOptions) {
    return debitWallet(options)
  }

  async credit(options: CreditWalletOptions) {
    return creditWallet(options)
  }
}

export const walletService = new WalletService()
```

## 2. Transactions Non Encapsulées

### Problème
Les transactions Drizzle sont utilisées directement dans les services au lieu d'être encapsulées :

```typescript
// lib/finance/wallet-service.ts
return await db.transaction(async (tx) => {
  // Logique transactionnelle
})
```

### Impact
- Difficulté de test
- Pas de réutilisation
- Logique de transaction dispersée

### Recommandation
Encapsuler les transactions dans les repositories :
```typescript
// lib/services/wallet/wallet-repository.ts
async transaction<T>(
  callback: (tx: DrizzleTransaction) => Promise<T>
): Promise<T> {
  return this.db.transaction(callback)
}
```

## 3. Absence de Cache

### Problème
Aucun cache n'est utilisé pour les données fréquemment consultées :
- Liste des agences
- Liste des produits
- Configuration des fournisseurs
- Taux de change

### Impact
- Requêtes répétitives inutiles
- Charge sur la base de données
- Latence accrue

### Recommandation
Implémenter un cache Redis ou utiliser le cache Next.js :
```typescript
// lib/services/agencies/agency-repository.ts
import { cache } from "react"

export class AgencyRepository {
  async findAll() {
    return cache("agencies:all", async () => {
      return this.db.query.agencies.findMany()
    }, { revalidate: 3600 }) // 1 heure
  }
}
```

## 4. Pas de Validation des Données

### Problème
Les données ne sont pas validées avant insertion/mise à jour :
```typescript
// lib/wallet/actions.ts
await db.insert(walletTransactions).values({...})
```

### Impact
- Données invalides en base
- Erreurs potentielles
- Incohérence

### Recommandation
Utiliser Zod pour la validation dans les repositories :
```typescript
// lib/services/wallet/wallet-repository.ts
import { walletLedgerInsertSchema } from "@/lib/db/schema"

async createLedgerEntry(data: NewWalletLedger) {
  const validated = walletLedgerInsertSchema.parse(data)
  return this.db.insert(walletLedger).values(validated).returning()
}
```

## 5. Pas de Gestion d'Erreurs

### Problème
Les erreurs de base de données ne sont pas gérées de manière cohérente :
```typescript
// lib/pro/dashboard-data.ts
const db = getDb()
// Pas de try/catch
```

### Impact
- Erreurs non gérées
- Messages d'erreur cryptiques
- Difficulté de debug

### Recommandation
Créer des classes d'erreur personnalisées et les utiliser dans les repositories :
```typescript
// lib/errors/database-error.ts
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message)
    this.name = "DatabaseError"
  }
}

export class NotFoundError extends DatabaseError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, "NOT_FOUND", { entity, id })
  }
}

// Utilisation
// lib/services/wallet/wallet-repository.ts
async findById(id: string) {
  const wallet = await this.db.query.walletAccounts.findFirst({
    where: eq(walletAccounts.id, id),
  })
  if (!wallet) {
    throw new NotFoundError("Wallet", id)
  }
  return wallet
}
```

## Plan de Migration Prioritaire

### Étape 1 : Création des Repositories (1 semaine)
1. Créer `lib/services/wallet/wallet-repository.ts`
2. Créer `lib/services/reservations/reservation-repository.ts`
3. Créer `lib/services/payments/payment-repository.ts`
4. Créer `lib/services/customers/customer-repository.ts`
5. Créer `lib/services/agencies/agency-repository.ts`

### Étape 2 : Migration des Services (1 semaine)
1. Migrer `lib/wallet/actions.ts` vers `wallet-service.ts`
2. Migrer `lib/booking/actions.ts` vers `reservation-service.ts`
3. Migrer `lib/admin/actions.ts` vers `agency-service.ts`
4. Migrer `lib/admin/reservations-data.ts` vers `reservation-repository.ts`

### Étape 3 : Ajout du Cache (3 jours)
1. Implémenter Redis ou Next.js cache
2. Ajouter le cache aux données fréquemment consultées
3. Configurer les temps de revalidation

### Étape 4 : Validation et Gestion d'Erreurs (2 jours)
1. Ajouter Zod validation dans les repositories
2. Créer les classes d'erreur personnalisées
3. Mettre à jour tous les repositories

### Étape 5 : Tests (3 jours)
1. Écrire des tests unitaires pour les repositories
2. Écrire des tests d'intégration pour les services
3. Tests de régression

## Conclusion

La Data Layer souffre de :
1. Appels directs à la base de données dispersés (50+ fichiers)
2. Transactions non encapsulées
3. Absence de cache
4. Pas de validation des données
5. Pas de gestion d'erreurs cohérente

Une migration progressive vers une architecture Repository/Service est recommandée pour améliorer la maintenabilité et la performance.
