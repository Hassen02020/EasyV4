# Guide de Simulation Production — Easy2Book

> Objectif : exécuter et valider l'application en conditions réelles de production sur `localhost`, avant le déploiement sur Vercel.

---

## 1. Script de sécurité — Liste exhaustive des URLs

### 1.1 Lister les routes

```bash
# Liste toutes les routes (pages, API, skeletons)
npx tsx scripts/list-routes.ts

# Export JSON pour audit sécurité
npx tsx scripts/list-routes.ts --json > audit-routes.json
```

### 1.2 Résultat attendu

| Type                | Compteur                                      | Exemples                    |
| ------------------- | --------------------------------------------- | --------------------------- |
| **Pages publiques** | `/`, `/login`, `/hotels/search`               | Accessible sans auth        |
| **Pages protégées** | `/admin/*`, `/pro/*`                          | Middleware `auth.ts` requis |
| **API routes**      | `/api/hotels/search`, `/api/cron/purge-audit` | Rate limiting + cache       |
| **Webhooks**        | `/api/auth/callback`                          | Vérifier CSRF / secret      |
| **Skeletons**       | `loading.tsx` associés                        | Vérifier couverture 100%    |

**Action de sécurité :** comparer la liste générée avec la matrice d'accès du CDC. Toute route orpheline = risque.

---

## 2. Configuration Simulation Prod sur Localhost

### 2.1 Fichier `.env.local.production`

Créer `cp .env.example .env.local.production` puis y copier **uniquement** les valeurs de production :

```env
# === Strict prod ===
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# === DB ===
DATABASE_URL=postgresql://...pooler...
DATABASE_DIRECT_URL=postgresql://...direct...

# === Auth (vraies clés prod, jamais commitées) ===
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>

# === API externe (pas de fallback demo) ===
MYGO_LOGIN=<prod>
MYGO_PASSWORD=<prod>

# === Rate limiting strict ===
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=30

# === Cron secret ===
CRON_SECRET=<random-64-chars>

# === Paiement (sandbox interdit en prod sim) ===
SPS_ENVIRONMENT=production
SPS_MERCHANT_ID=<prod>
SPS_SECRET_KEY=<prod>

# === App ===
NEXT_PUBLIC_APP_URL=https://easy2book.tn
```

### 2.2 Build de production local

```bash
# 1. Charger les variables prod
set -a && source .env.local.production && set +a

# 2. Build Next.js (standalone recommandé pour Docker/Vercel)
npm run build

# 3. Lancer en mode strict production (pas de hot reload, pas de logs dev)
NODE_ENV=production npm run start
```

### 2.3 Désactiver les outils de développement

| Outil             | Action                                                   |
| ----------------- | -------------------------------------------------------- |
| React Strict Mode | `next.config.mjs` → `reactStrictMode: false` (optionnel) |
| Source maps       | Supprimer `.next/*.map` avant deploy                     |
| Console logs      | `grep -r "console\." app/ lib/ components/` → nettoyer   |
| Turbopack         | Forcer `next build` (webpack) pour test                  |

---

## 3. Scénarios de simulation critique

### 3a) Pic de trafic — Stress Test (500 utilisateurs)

**Outil :** `autocannon` (déjà installé en devDependency)

```bash
# Terminal 1 — Lancer l'app en mode production simulé
NODE_ENV=production npm run start

# Terminal 2 — Stress test
node scripts/stress-test.mjs

# Variante : cibler une page protégée (avec cookies si besoin)
node scripts/stress-test.mjs --target http://localhost:3000/pro/login --duration 60
```

**Seuils de réussite :**

- 0 erreur 5xx
- p99 latence < 5s
- > 100 req/s sur un dyno Vercel Hobby

**Pour un test encore plus réaliste (k6) :**

```bash
# Installer k6 (https://k6.io/docs/get-started/installation/)
k6 run - <<'EOF'
import http from 'k6/http';
export let options = {
  stages: [
    { duration: '30s', target: 100 },  // ramp-up
    { duration: '1m',  target: 500 },  // pic
    { duration: '30s', target: 0 },    // ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(99)<5000'],
    http_req_failed: ['rate<0.01'],
  },
};
export default function () {
  http.get('http://localhost:3000/pro/login');
}
EOF
```

---

### 3b) Latence réseau & débit faible — 3G instable

**Objectif :** vérifier que les skeletons s'affichent et que les timeouts API sont respectés.

#### Méthode 1 : Chrome DevTools (manuel)

1. Ouvrir `http://localhost:3000`
2. DevTools → Network → Throttling → `Fast 3G` ou `Slow 3G`
3. Recharger la page, observer les skeletons `loading.tsx`

#### Méthode 2 : Clumsy (Windows) — global system

```powershell
# Télécharger https://jagt.github.io/clumsy/
# Config : Inbound + Outbound, Lag 200ms, Drop 5%, Throttle 50%
# Puis tester l'app
```

#### Méthode 3 : Toxiproxy (cross-platform, recommandé CI)

```bash
# 1. Lancer toxiproxy
docker run -it --rm -p 8474:8474 -p 3001:3001 shopify/toxiproxy

# 2. Créer un proxy localhost:3000 -> toxiproxy:3001
curl -X POST http://localhost:8474/proxies -d '{
  "name": "nextjs",
  "listen": "0.0.0.0:3001",
  "upstream": "host.docker.internal:3000"
}'

# 3. Ajouter latence + jitter
curl -X POST http://localhost:8474/proxies/nextjs/toxics -d '{
  "name": "latency",
  "type": "latency",
  "attributes": { "latency": 300, "jitter": 100 }
}'

# 4. Tester via le proxy
open http://localhost:3001
```

**Validation :**

- Les skeletons doivent apparaître < 200ms (perceived performance)
- Les requêtes API doivent timeout après `MYGO_TIMEOUT_MS=15000` max
- Aucun crash client (ErrorBoundary doit catcher)

---

### 3c) Concurrence DB — Race condition wallet

**Objectif :** prouver que `depositBalance` ne peut pas être débité deux fois.

```bash
# ⚠️ UTILISER UNIQUEMENT UNE DB DE TEST
export DATABASE_URL="postgresql://...test-db..."
export TEST_AGENCY_ID="00000000-0000-0000-0000-000000000001"

npx tsx scripts/wallet-race-test.ts
```

**Comment ça marche :**

1. Initialise le solde à 200 TND
2. Lance 5 débits simultanés de 50 TND chacun
3. Avec `FOR UPDATE` (verrou ligne), seuls 4 passent
4. Sans verrou = race condition → solde négatif possible

**Si vous voulez tester l'inverse (race condition) :**

Éditer `scripts/wallet-race-test.ts` et commenter `.for("update")`. Le solde final sera alors erroné, prouvant la nécessité du verrou.

---

### 3d) Erreur 500 et Webhooks — Simulation de panne

#### Simuler une panne DB

```bash
# 1. Lancer l'app normalement
npm run dev

# 2. Interrompre temporairement le pool Supabase
#    (ex: couper le VPN, ou modifier .env avec une URL invalide)
export DATABASE_URL="postgresql://fake:5432/db"

# 3. Observer :
#    - La page /admin doit afficher "Mode dégradé"
#    - Les API doivent renvoyer 503 { error: "db_unavailable" }
```

#### Simuler un webhook tiers en échec

```bash
# Utiliser un mock server (json-server ou miragejs)
npx json-server --watch webhook-mock.json --port 9999 --routes webhook-routes.json

# Dans .env.local.production, rediriger le webhook vers le mock en échec :
SPS_NOTIFY_URL=http://localhost:9999/fake-webhook
# Puis renvoyer 500 depuis le mock pour vérifier la gestion d'erreur
```

#### Simuler une API myGo en timeout

Éditer `lib/mygo/client.ts` temporairement :

```ts
// Forcer un timeout
const MYGO_TIMEOUT_MS = 1 // 1ms → toujours en timeout
```

Observer que :

- Le circuit breaker s'ouvre après N échecs
- Le fallback JSON (fixture) est servi
- Aucun 500 côté client

---

## 4. Checklist avant MEP

- [ ] `npm run typecheck` → 0 erreur
- [ ] `npm run test` → 100% pass
- [ ] `npm run test:e2e` → 3 golden paths OK
- [ ] `node scripts/stress-test.mjs` → 0 erreur 5xx
- [ ] `npx tsx scripts/wallet-race-test.ts` → 0 race condition
- [ ] `npx tsx scripts/list-routes.ts --json` → audit routes OK
- [ ] Build prod local → pas de warning webpack critiqu
- [ ] Variables d'environnement production renseignées (pas de fallback dev)
- [ ] `CRON_SECRET` et `SPS_SECRET_KEY` > 32 caractères aléatoires

---

## 5. Commande unique de validation

```bash
# Lance TOUTE la suite de validation locale
npm run typecheck && \
npm run test && \
npm run build && \
NODE_ENV=production npm run start &
PID=$!
sleep 5
node scripts/stress-test.mjs
npx tsx scripts/wallet-race-test.ts
kill $PID
```
