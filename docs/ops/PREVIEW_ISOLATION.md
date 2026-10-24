# Isolation Preview / Production (PREVIEW-PROD-ISOLATION-01)

Une Preview Vercel ne doit jamais écrire dans la base de production ni déclencher un paiement réel.
La garde `lib/env-isolation.ts` refuse tout service si cette règle n'est pas prouvée par la configuration, à trois niveaux :

1. `validateEnv()` (`instrumentation.ts`) : journalise la liste détaillée des variables en cause (`[env] DÉMARRAGE REFUSÉ`).
2. `proxy.ts` : première instruction, avant toute résolution tenant/session — répond **HTTP 503** à toute requête.
3. `getDb()`, `createServerSupabase()`, `createServiceRoleSupabase()`, stockage média Supabase : refusent de créer une connexion.

Les niveaux 2 et 3 sont indispensables : sur Vercel, une erreur levée dans `register()` devient une « Unhandled Rejection » et Next **rend quand même** la requête en cours avant l'arrêt du processus (constaté sur la Preview de la PR #269, 2026-10-24 : page servie en HTTP 200 après des tentatives de requêtes vers la base configurée).

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
- Une Preview mal configurée **échoue dès le build Vercel** (le pré-rendu des pages lit la base : `Error occurred prerendering page … [env] DÉMARRAGE REFUSÉ — déploiement non isolé de la production`) — rien n'est déployé, aucune lecture de la base de production au build. Constaté sur `dpl_8xYi2vKXXwAs5QYKJxsHQh973Egy` (commit 21ea970e, 2026-10-24). Avant cette garde, chaque build Preview lisait la base de production pendant le pré-rendu.
- Si un déploiement non isolé démarrait malgré tout, il répondrait HTTP 503 (`[env] DÉMARRAGE REFUSÉ — déploiement non isolé de la production`) sur toutes les routes ; la liste des variables en cause figure dans les logs Vercel.
