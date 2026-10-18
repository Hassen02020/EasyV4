#!/usr/bin/env bash
# =============================================================================
# run-e2e-local.sh — Stack E2E local complet
#
# Orchestrateur de la répétition générale locale : base throwaway, seed,
# GoTrue, app Next.js, Playwright 18 specs.
#
# Prérequis :
#   - Docker (pour Supabase CLI local)
#   - supabase CLI : https://supabase.com/docs/guides/cli
#   - Node.js + pnpm
#   - .env.test (copié depuis .env.test.example et rempli)
#
# Usage :
#   bash scripts/run-e2e-local.sh            # run complet
#   bash scripts/run-e2e-local.sh --no-start # sauter le start Supabase (déjà lancé)
#   bash scripts/run-e2e-local.sh --spec e2e/a11y.spec.ts  # 1 spec uniquement
#   bash scripts/run-e2e-local.sh --cleanup  # arrêt + cleanup Supabase seulement
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.test"

# --- Couleurs ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

# --- Args ---
NO_START=0; CLEANUP_ONLY=0; SPEC=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-start)  NO_START=1; shift ;;
    --cleanup)   CLEANUP_ONLY=1; shift ;;
    --spec)      SPEC="$2"; shift 2 ;;
    *) err "Argument inconnu : $1"; exit 1 ;;
  esac
done

# --- Cleanup function ---
cleanup() {
  echo ""
  warn "Arrêt de l'application Next.js..."
  kill "$APP_PID" 2>/dev/null || true
  if [[ $NO_START -eq 0 ]]; then
    warn "Arrêt du stack Supabase local..."
    cd "$ROOT" && supabase stop 2>/dev/null || true
  fi
  ok "Cleanup terminé."
}

# --- Cleanup only ---
if [[ $CLEANUP_ONLY -eq 1 ]]; then
  cd "$ROOT"
  warn "Arrêt stack Supabase..."
  supabase stop && ok "Supabase arrêté."
  exit 0
fi

# --- Vérifications préalables ---
echo "=== Easy2Book — E2E Local Stack ==="
echo ""

if [[ ! -f "$ENV_FILE" ]]; then
  err ".env.test introuvable. Copier .env.test.example → .env.test et remplir."
  exit 1
fi

for cmd in supabase node pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    err "Commande manquante : $cmd"
    exit 1
  fi
done

# Charger .env.test
set -o allexport && source "$ENV_FILE" && set +o allexport

# --- 1. Supabase local ---
cd "$ROOT"
if [[ $NO_START -eq 0 ]]; then
  echo ""
  echo "--- 1/6 Supabase CLI start ---"
  supabase start
  ok "Supabase démarré."
fi

# --- 2. Schéma DB ---
echo ""
echo "--- 2/6 Schéma DB (drizzle push) ---"
pnpm db:push --force
echo "  → Replay migrations manuelles..."
for f in "$ROOT"/drizzle/manual/*.sql; do
  node --import tsx --input-type=module <<EOF 2>/dev/null || true
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
const db = drizzle(postgres(process.env.DATABASE_DIRECT_URL))
const content = require("fs").readFileSync("$f", "utf8")
await db.execute(sql.raw(content))
EOF
  echo "  → $(basename "$f") appliqué."
done
ok "Schéma DB prêt."

# --- 3. Seed infrastructure ---
echo ""
echo "--- 3/6 Seed infrastructure (seed-base-infra.ts) ---"
node --import tsx "$ROOT/scripts/seed-base-infra.ts"
ok "Seed infra terminé."

# --- 4. Utilisateurs GoTrue ---
echo ""
echo "--- 4/6 Création utilisateurs GoTrue E2E ---"
node --import tsx "$ROOT/scripts/create-e2e-gotrue-users.ts"
ok "Utilisateurs GoTrue créés."

# --- 5. Next.js ---
echo ""
echo "--- 5/6 Démarrage application Next.js (port 3000) ---"
APP_PID=""
trap cleanup EXIT INT TERM

PAYMENT_MODE=virtual \
MYGO_MODE=virtual \
MEDIA_STORAGE_BACKEND=local \
  pnpm dev --port 3000 &
APP_PID=$!

echo "  → Attente que l'app soit prête..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:3000" -o /dev/null 2>/dev/null; then
    ok "Application prête (http://localhost:3000)."
    break
  fi
  sleep 2
  if [[ $i -eq 30 ]]; then
    err "L'application n'a pas démarré après 60 secondes."
    exit 1
  fi
done

# --- 6. Playwright ---
echo ""
echo "--- 6/6 Tests Playwright (18 specs) ---"
if [[ -n "$SPEC" ]]; then
  warn "Mode spec unique : $SPEC"
  PLAYWRIGHT_BASE_URL="http://localhost:3000" \
    pnpm exec playwright test "$SPEC" --reporter=list
else
  PLAYWRIGHT_BASE_URL="http://localhost:3000" \
    pnpm exec playwright test --reporter=html,list
fi

ok "Playwright terminé. Rapport : playwright-report/index.html"
