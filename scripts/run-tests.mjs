// run-tests.mjs
// Découvre tous les fichiers .test.ts sous lib/ et tests/,
// puis les passe au runner natif Node.js avec tsx.
// Compatible Windows / macOS / Linux.

import { readdirSync, statSync } from "fs"
import { join, relative } from "path"
import { spawnSync } from "child_process"

const ROOT = process.cwd()
const PATTERNS = ["lib", "tests"]

function findTests(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      findTests(full, files)
    } else if (
      entry.name.endsWith(".test.ts") ||
      entry.name.endsWith(".test.mts")
    ) {
      files.push(relative(ROOT, full))
    }
  }
  return files
}

const testFiles = []
for (const pat of PATTERNS) {
  const dir = join(ROOT, pat)
  try {
    if (statSync(dir).isDirectory()) {
      findTests(dir, testFiles)
    }
  } catch {
    // dossier inexistant → ignoré
  }
}

if (testFiles.length === 0) {
  console.log("⚠️ Aucun fichier de test trouvé.")
  process.exit(0)
}

console.log(
  `🧪 ${testFiles.length} fichier(s) de test détecté(s) :\n   ${testFiles.join("\n   ")}\n`,
)

// Hermétique vis-à-vis de l'environnement de l'appelant : plusieurs tests
// (lib/mygo/__tests__/search-core.test.ts, lib/hotel-suppliers/__tests__/
// search-hub.test.ts et flexible-search.test.ts) attendent le mode démo
// par défaut (MYGO_LOGIN absent → fixture statique déterministe). Si
// l'appelant a chargé un `.env.local` de dev/E2E (MYGO_MODE=virtual,
// MYGO_LOGIN=... pour piloter le Virtual MyGo Supplier via navigateur),
// ces variables fuiteraient dans ce process et basculeraient ces tests
// vers le VRAI Virtual MyGo Supplier — qui émet volontairement un
// searchId/token neufs à chaque appel (non caché, TTL de recherche à 0 en
// mode virtuel) — cassant les assertions "deux appels doivent renvoyer un
// résultat identique" écrites pour le mode démo déterministe. On retire
// donc explicitement ces variables du process enfant ; chaque test qui a
// réellement besoin du mode virtuel le pose lui-même localement (voir
// lib/hotel-suppliers/__tests__/mygo-driver.test.ts,
// lib/mygo/__tests__/config.test.ts, lib/payment/__tests__/
// virtual-payment-provider.test.ts) — rien ne dépend de ces variables
// venant de l'extérieur du process de test.
const childEnv = { ...process.env }
for (const key of [
  "MYGO_MODE",
  "MYGO_LOGIN",
  "MYGO_PASSWORD",
  "PAYMENT_MODE",
  "PAYMENT_PROVIDER",
]) {
  delete childEnv[key]
}

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit", cwd: ROOT, env: childEnv },
)

process.exit(result.status ?? 0)
