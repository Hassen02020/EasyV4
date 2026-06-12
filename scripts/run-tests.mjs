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

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit", cwd: ROOT },
)

process.exit(result.status ?? 0)
