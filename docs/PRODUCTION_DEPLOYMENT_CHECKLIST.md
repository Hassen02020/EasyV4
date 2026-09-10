# Checklist de mise en production — Easy2Book

> Audit de préparation uniquement — **aucun projet Supabase réel ni déploiement
> Vercel n'a été créé pour produire ce document**. Chaque section reflète l'état
> réel du repo (migrations, variables d'env, endpoints) tel qu'audité, pas des
> hypothèses. Complète `docs/PRODUCTION_SIMULATION.md` (simulation locale) —
> ce document couvre le "go live" réel.

---

## 1. Supabase production

### 1.1 Créer le projet

- Région recommandée : la plus proche des utilisateurs finaux (Tunisie → `eu-west-2`
  ou `eu-west-3` selon disponibilité Supabase).
- Noter immédiatement : `project ref`, mot de passe DB, URL projet.

### 1.2 Appliquer les migrations — DEUX familles, ordre obligatoire

Le repo a **deux mécanismes de migration distincts, non unifiés** — fait confirmé
en lisant `drizzle.config.ts` et `package.json` : aucun script n'automatise
l'application de `drizzle/manual/*.sql`, uniquement `drizzle/*.sql` versionnées.

1. **Migrations Drizzle-kit versionnées** (`drizzle/0000_*.sql` → `drizzle/0010_*.sql`,
   11 fichiers) : appliquer via `pnpm db:migrate` (utilise `DATABASE_DIRECT_URL`,
   port 5432 direct — jamais le pooler 6543 pour les migrations).
2. **Migrations manuelles RLS/hardening** (`drizzle/manual/0001_*.sql` → `0042_*.sql`,
   42 fichiers, non exécutées par `db:migrate`) : appliquer **une par une, dans
   l'ordre numérique**, via `psql` ou le SQL Editor Supabase. Ce sont ces
   fichiers qui posent les policies RLS, les fonctions `SECURITY DEFINER`
   (`set_agency_deposit_balance`, `lock_agency_for_debit`, résolution de
   contexte de session `app.current_agency_id`/`app.is_super_admin`, etc.) —
   **sans elles l'app tourne sans RLS effective**, faille critique.
3. **Vérification post-migration obligatoire** : `SELECT tablename, rowsecurity
   FROM pg_tables WHERE schemaname='public'` → confirmer `rowsecurity = true`
   sur TOUTES les tables sensibles (`reservations`, `payments`, `agencies`,
   `partner_credit_movements`, `wallet_accounts`, `wallet_ledger`, `customers`,
   `audit_events`, etc.). Une table avec RLS désactivée après migration =
   régression silencieuse à bloquer avant toute mise en trafic.
4. **Seed obligatoire non-fake** : `drizzle/manual/0002_seed_currencies.sql`
   (devises réelles, TND/EUR/USD) — nécessaire au fonctionnement des prix, ce
   n'est pas une donnée de démo. `scripts/seed-mock-data.ts` en revanche
   génère des clients/réservations **fictifs** — ne jamais l'exécuter contre
   la base production.

### 1.3 Config Auth (Supabase GoTrue)

- Configurer les URLs de redirection réelles (`https://<domaine>/auth/callback`
  etc.) dans Supabase Dashboard → Authentication → URL Configuration.
- Désactiver l'inscription publique si le modèle métier l'exige (à confirmer
  côté produit — hors scope technique de cet audit).
- Vérifier le template d'email (confirmation, reset password) en français.

### 1.4 Connexion applicative

- `DATABASE_URL` = URL **pooler** (port 6543, `pgbouncer=true`) — utilisée par
  l'app Next.js en runtime (Vercel serverless/edge).
- `DATABASE_DIRECT_URL` = URL **directe** (port 5432) — réservée aux migrations
  (`drizzle-kit`), jamais utilisée par l'app en runtime.

---

## 2. Secrets — inventaire réel depuis `.env.example`

Toutes les variables ci-dessous existent déjà dans `.env.example` (201 lignes,
état actuel du repo). Statut = obligatoire/optionnel tel qu'implémenté dans le
code (pas une supposition) :

| Variable | Obligatoire ? | Génération / source |
|---|---|---|
| `DATABASE_URL`, `DATABASE_DIRECT_URL` | **Oui** | Supabase → Project Settings → Database |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **Oui** | Supabase → Project Settings → API |
| `MYGO_MODE` | **Oui — doit être `live` ou absent** en prod (`virtual` route tout vers le simulateur local, jamais acceptable en prod) | — |
| `MYGO_LOGIN`, `MYGO_PASSWORD`, `MYGO_API_BASE_URL` | **Oui** si `MYGO_MODE≠virtual` | Fournies par myGo (contrat fournisseur) |
| `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY` | **Oui** (chiffrement AES-256-GCM des identifiants fournisseur en DB) | `openssl rand -hex 32` — **jamais réutiliser la valeur `.env.example`** |
| `CRON_SECRET` | **Oui** (protège `/api/cron/*`, référencé par `vercel.json`) | `openssl rand -hex 32`, > 32 caractères |
| `HEALTH_SECRET` | Recommandé (déverrouille le détail SLO de `/api/health`) | `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Fortement recommandé — sans Redis, rate limiting et circuit breaker myGo retombent en mode in-memory **par instance serverless** (inefficace en multi-pod) | console.upstash.com |
| `RESEND_API_KEY` | Nécessaire pour l'email transactionnel (confirmation, voucher, facture) | resend.com |
| `SPS_*` (Monétique Tunisie) | Nécessaire si paiement carte activé | Fournies par SPS, `SPS_ENVIRONMENT=production` |
| `STRIPE_*` / `ZITOUNA_PAY_*` | Optionnel — dépend des moyens de paiement activés en prod | — |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Optionnel — sans elles, le provider WhatsApp reste un stub honnête (aucune notification envoyée, pas d'erreur) | Meta Business Manager |
| `TWILIO_*` | Optionnel — idem, SMS chauffeur ignoré sans clés | console.twilio.com |
| `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` | **Oui** si les jobs background (emails, notifications, retry engine) doivent tourner en prod (pas seulement en dev via `inngest dev`) | app.inngest.com |
| `SENTRY_DSN` | Optionnel (package non installé actuellement — `npm install @sentry/nextjs` requis avant utilisation, voir §4) | sentry.io |
| `VIRTUAL_MYGO_TOKEN_SECRET` | **À ne PAS configurer en prod réel** (n'a de sens qu'en `MYGO_MODE=virtual`, jamais actif en prod) | — |
| `NEXT_PUBLIC_APP_URL` | **Oui** | URL de prod réelle (`https://...`) |
| `FEATURE_*` | Optionnel — désactivées par défaut pour les modules non prêts (`FEATURE_VOLS=false`, `FEATURE_CAR=false`) ; garder cohérent avec ce qui est réellement livrable | — |

**Règle générale confirmée en code** : aucune valeur par défaut de dev (`changeme-*`,
`virtual-mygo-dev-secret-not-for-prod`) ne doit survivre en production — grep
`changeme` et `dev-secret` dans les valeurs réelles avant mise en ligne.

---

## 3. Vercel

- Lier le repo Git au projet Vercel (`Framework: Next.js`, build command
  `next build`, déjà standard — pas de config custom requise dans
  `next.config.mjs`).
- Renseigner **toutes** les variables du §2 dans Vercel → Project Settings →
  Environment Variables, scope `Production` (et `Preview` avec des valeurs
  sandbox séparées si des previews doivent fonctionner sans toucher la DB prod).
- `vercel.json` existant définit déjà 2 crons (`/api/cron/purge-audit` à 3h,
  `/api/cron/warm-cache` à 4h) — protégés par `CRON_SECRET`, vérifiés
  fonctionnels par le code (`app/api/cron/*`).
- Domaine custom : configurer + forcer HTTPS (comportement Vercel par défaut).

---

## 4. Monitoring / Observabilité

- `/api/health` (déjà implémenté, `app/api/health/route.ts`) : endpoint public
  minimal (`{status: ok|degraded|down}`, 503 si down) + endpoint détaillé
  (SLO mygo.search / wallet.debit / inventory, P99 latence) derrière le header
  `X-Health-Secret`. **À brancher sur un uptime monitor externe** (ex.
  UptimeRobot, Better Uptime, ou Vercel Health Checks natif via
  `"healthcheck": {"path": "/api/health"}` dans `vercel.json` — absent
  actuellement, à ajouter si Vercel Health Checks doit être utilisé).
- Sentry : le code référence `SENTRY_DSN` dans `.env.example` mais **le package
  `@sentry/nextjs` n'est pas dans `package.json`** — confirmé par absence dans
  les dépendances. Décision produit requise avant d'activer : installer et
  initialiser (`sentry.client.config.ts`/`sentry.server.config.ts`) ou
  documenter explicitement que Sentry n'est pas utilisé pour ce lancement.
- Logs applicatifs : `LOG_LEVEL` (défaut `info`) via `lib/logger` — vérifier
  qu'aucun `console.log` de debug ne fuit de données sensibles (paiement,
  token) en prod ; déjà couvert en partie par `docs/PRODUCTION_SIMULATION.md`
  §2.3.

---

## 5. Sécurité — checklist pré-lancement

- [ ] `SUPPLIER_CREDENTIALS_ENCRYPTION_KEY`, `CRON_SECRET`, `HEALTH_SECRET`
      régénérés en prod (jamais les valeurs `.env.example`).
- [ ] `MYGO_MODE` absent ou `live` — jamais `virtual` en production.
- [ ] RLS vérifiée active sur toutes les tables sensibles (§1.2 point 3).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` jamais exposée côté client (déjà respecté
      dans le code — aucun import de ce secret hors `lib/supabase/server.ts`
      / routes serveur, à re-vérifier par grep avant chaque release majeure).
- [ ] Rate limiting actif (`UPSTASH_REDIS_REST_URL` configuré — sinon
      fallback in-memory par instance, insuffisant en prod multi-instance).
- [ ] `npm run typecheck && npm run lint && npm run test && npm run build`
      verts sur le commit de release (déjà la pratique de ce repo à chaque
      lot de cette session).
- [ ] Scénario de panne DB / myGo testé en conditions prod-like (voir
      `docs/PRODUCTION_SIMULATION.md` §3d) avant le jour du lancement.

---

## 6. Backup / continuité

- Activer les **backups automatiques quotidiens** Supabase (Project Settings →
  Database → Backups) — inclus dès le plan Pro ; sur le plan Free, backups
  limités/absents, à vérifier selon le plan réellement souscrit.
- **Point-in-Time Recovery (PITR)** : recommandé si le budget agence
  (`agencies.deposit_balance`) et les paiements doivent être restaurables à
  la minute près en cas d'incident — décision produit/coût, pas uniquement
  technique.
- Conserver un export SQL du schéma + des 53 fichiers de migration (11
  versionnées + 42 manuelles) dans le repo Git (déjà le cas) — **c'est la
  seule source de vérité fiable pour reconstruire le schéma** si jamais un
  projet Supabase doit être recréé (changement de compte, incident région...).
- Documenter (hors du scope technique de cet audit, décision opérationnelle)
  qui a accès au service role key et comment il est stocké/rotaté.

---

## 7. Ce que ce document ne fait PAS

Conformément à la consigne "préparer sans déployer" : aucun projet Supabase
n'a été créé, aucune valeur de secret réelle n'a été générée ou stockée,
aucun déploiement Vercel n'a été déclenché. Ce document est un audit de l'état
réel du repo (migrations, variables, endpoints) traduit en checklist
actionnable pour la personne qui exécutera le déploiement réel.
