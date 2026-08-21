# `lib/db/` — Couche persistance TunisiaGo (Drizzle + Supabase)

Schéma multi-tenant pour la plateforme OTA TunisiaGo.

## Vue d'ensemble

| Fichier | Rôle |
|---|---|
| `schema.ts` | **Source of truth** — toutes les tables Drizzle. À éditer pour faire évoluer le modèle. |
| `client.ts` | Factory `getDb()` qui retourne une instance Drizzle connectée. |
| `../drizzle/0000_*.sql` | Migration auto-générée (`pnpm db:generate`). |
| `../drizzle/manual/0001_rls_policies.sql` | RLS policies (à appliquer **après** la migration auto). |
| `../drizzle/manual/0002_seed_currencies.sql` | Seed des devises ISO 4217. |

## Modèle de données

### Multi-tenant

- `agencies` est la racine. Toutes les tables métier ont `agency_id NOT NULL`.
- RLS Postgres isole les lignes par `agency_id` via `current_agency_id()`.
- `super_admin` (rôle `users.role`) bypass l'isolation.

### Réservations polymorphes

```
reservations  (master, discriminator = module)
  ├── reservation_hotel       (1-1, module='hotel')
  ├── reservation_flight      (1-1, module='flight')
  ├── reservation_package     (1-1, module='package')   ← Voyages Organisés
  ├── reservation_activity    (1-1, module='activity')  ← Attractions
  ├── reservation_transfer    (1-1, module='transfer')  ← Transferts
  └── reservation_omra        (1-1, module='omra')
```

Tout `reservation` partage : `public_ref`, `customer_id`, `status`, devise/montants
(`original_currency`, `original_amount`, `tnd_amount`), acompte, voucher.

Les champs **spécifiques** au module vont dans la table d'extension (ex. `reservation_hotel.checkIn`,
`reservation_transfer.flightNumber`).

### Multi-currency encaissable

Chaque ligne monétaire (`reservations`, `payments`) stocke :
- `original_currency` + `original_amount` — devise saisie au paiement
- `tnd_amount` — équivalent figé en TND au moment de l'opération (compta TN)

Le taux utilisé est lu depuis `exchange_rates` à T=paiement (jamais recalculé après).

### Paiements

`payments` est dissocié de `reservations` (1-N) :
- `kind='deposit'` → acompte 30 % via SPS Monétique
- `kind='balance'` → solde (à l'hôtel pour myGo, ou autre PSP plus tard)
- `kind='refund'` → remboursement partiel/total

### Audit

`audit_events` enregistre toute action sensible (création résa, capture paiement, refund, login admin)
avec `actor_user_id`, `entity_type/id`, `diff jsonb`, `ip_address`, `user_agent`.

## Setup Supabase (à faire **après** réception des credentials)

```bash
# 1. Renseigner .env.local
cp .env.example .env.local
# DATABASE_URL = pooler URL (port 6543)
# DATABASE_DIRECT_URL = connection directe (port 5432)
# NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 2. Appliquer la migration auto (DDL)
pnpm db:push        # dev (push direct)
# OU
pnpm db:migrate     # prod (versionné)

# 3. Appliquer RLS + seed (en SQL direct)
psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0001_rls_policies.sql
psql "$DATABASE_DIRECT_URL" -f drizzle/manual/0002_seed_currencies.sql

# 4. Créer la 1ʳᵉ agence "TunisiaGo" et le 1ᵉʳ super-admin
# (script seed dédié à venir, ou via Drizzle Studio)
pnpm db:studio
```

## Évolution du schéma

1. Modifier `lib/db/schema.ts`.
2. `pnpm db:generate` → produit un nouveau fichier `drizzle/000X_*.sql`.
3. Vérifier le SQL généré (ouvrir le diff).
4. `pnpm db:push` (dev) ou `pnpm db:migrate` (prod).

Ne **jamais** éditer manuellement les fichiers `drizzle/000*.sql` auto-générés.
Pour des modifs hors-DDL (RLS, seed, fonctions), créer un nouveau fichier
dans `drizzle/manual/` et l'appliquer manuellement.
