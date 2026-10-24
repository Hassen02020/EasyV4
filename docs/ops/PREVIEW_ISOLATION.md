# Isolation Preview / Production (PREVIEW-PROD-ISOLATION-01)

Une Preview Vercel ne doit jamais écrire dans la base de production ni déclencher un paiement réel.
La garde `lib/env-isolation.ts`, appelée par `validateEnv()` (`instrumentation.ts`), **refuse le démarrage du serveur** si cette règle n'est pas prouvée par la configuration.

## Détermination de l'environnement

`VERCEL_ENV` fait foi, jamais `NODE_ENV` (qui vaut `production` aussi en Preview).

| Contexte                                                | Environnement retenu | Effet de la garde                            |
| ------------------------------------------------------- | -------------------- | -------------------------------------------- |
| `VERCEL_ENV=production`                                 | production           | aucune règle ajoutée (comportement inchangé) |
| `VERCEL_ENV=preview`                                    | preview              | règles ci-dessous, échec fermé               |
| `VERCEL_ENV=development` (`vercel dev`)                 | development          | aucune règle ajoutée                         |
| `VERCEL=1` sans `VERCEL_ENV` valide, ou valeur inconnue | indéterminé          | **démarrage refusé**                         |
| hors Vercel (poste local, CI)                           | local                | aucune règle ajoutée                         |

## Règles en Preview (toutes obligatoires)

| Variable                           | Exigence                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `PREVIEW_SUPABASE_PROJECT_REF`     | référence (20 lettres) du projet Supabase **de Preview** ; ne doit pas être celle de production     |
| `DATABASE_URL`                     | hôte `db.<ref>.supabase.co` ou utilisateur pooler `postgres.<ref>` avec `<ref>` = référence Preview |
| `NEXT_PUBLIC_SUPABASE_URL`         | `https://<ref>.supabase.co` avec `<ref>` = référence Preview                                        |
| `DATABASE_DIRECT_URL` (si définie) | même projet que ci-dessus                                                                           |
| aucune de ces URL                  | ne doit contenir la référence de production (`PRODUCTION_SUPABASE_PROJECT_REFS`)                    |
| `PAYMEE_ENVIRONMENT`               | jamais `production` ; vaut **explicitement** `sandbox` si `PAYMEE_API_KEY` est définie              |
| `PAYMEE_BASE_URL` (si définie)     | hôte `sandbox.paymee.tn` uniquement                                                                 |
| `STRIPE_SECRET_KEY` (si définie)   | clé de test `sk_test_…` uniquement                                                                  |
| `SPS_SECRET_KEY`                   | interdite (mode test non vérifiable)                                                                |

Les messages d'erreur ne contiennent que des noms de variables et des références de projet (publiques), jamais une valeur secrète.

## Procédure de mise en place (actions propriétaire)

1. **Créer un projet Supabase séparé** pour la Preview (même région que la production), sans copie de données de production.
2. **Initialiser son schéma** avec la procédure du job CI `financial-e2e` (`.github/workflows/ci.yml`) : `drizzle-kit push`, stubs `auth`/rôles, rôle `app_runtime`, grants, rejeu de `drizzle/manual/*.sql`, grants de fonctions.
3. **Vercel → Settings → Environment Variables, portée « Preview » uniquement** :
   - `PREVIEW_SUPABASE_PROJECT_REF` = référence du nouveau projet ;
   - `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` = valeurs du projet de Preview ;
   - `PAYMENT_PROVIDER=paymee`, `PAYMEE_ENVIRONMENT=sandbox`, `PAYMEE_API_KEY` = clé **sandbox** Paymee ;
   - retirer de la portée Preview toute clé Stripe live et `SPS_SECRET_KEY`.
     Ne pas toucher à la portée « Production ».
4. **Redéployer une Preview** et vérifier : le serveur démarre, une recharge de test crée sa ligne dans la base de Preview et **aucune** ligne n'apparaît en production.

Tant que l'étape 3 n'est pas faite, **toutes les Previews refusent de démarrer** (échec fermé voulu).

## Vérification

- Tests : `node --import tsx --test lib/__tests__/env-isolation.test.ts`.
- Une Preview mal configurée échoue au démarrage avec `[env] DÉMARRAGE REFUSÉ` et la liste des variables en cause dans les logs Vercel.
