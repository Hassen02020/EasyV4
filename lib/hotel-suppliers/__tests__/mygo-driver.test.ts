import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { MyGoDriver } from "../mygo/driver"

/**
 * lib/mygo/config.ts::getMyGoConfig() met en cache son résultat au niveau
 * module (`let cached: MyGoConfig | null = null`) — comportement existant,
 * volontairement non modifié ici ("reuse, don't duplicate/redesign"). Une
 * fois résolue avec succès dans CE process, la config reste figée pour
 * tous les appels suivants, quels que soient les changements de
 * process.env — donc un seul scénario "succès" est fiable par process.
 * On garde ici le scénario réellement utilisé par cet environnement
 * (MYGO_MODE=virtual). Les scénarios "live sans/avec credentials" sont
 * testés dans un VRAI process enfant isolé ci-dessous, seule façon fiable
 * de les exercer sans modifier le cache existant.
 */

test("MyGoDriver.getConfigStatus : mode virtuel (crédentiels de test auto-remplies) -> CONFIGURED, jamais présenté comme réel", () => {
  process.env.MYGO_MODE = "virtual"
  const driver = new MyGoDriver()
  assert.equal(driver.getConfigStatus(), "CONFIGURED")
  assert.equal(driver.isVirtualMode(), true)
})

test("MyGoDriver.search : destinationId non numérique -> erreur explicite, jamais un cityId inventé", async () => {
  const driver = new MyGoDriver()
  await assert.rejects(
    () =>
      driver.search({
        destinationId: "not-a-city-id",
        checkIn: "2026-09-10",
        checkOut: "2026-09-13",
        rooms: [{ adults: 2 }],
        currency: "TND",
      }),
    /destinationId invalide/,
  )
})

function runInIsolatedProcess(env: Record<string, string | undefined>): { status: string; isVirtual: boolean } {
  // Écrit un vrai fichier temporaire exécuté par tsx dans un process neuf
  // (importer le driver et imprimer son état en JSON sur stdout) — seule
  // façon fiable de contourner le cache module-level existant de
  // lib/mygo/config.ts sans le modifier. Écrit DANS le projet (pas /tmp)
  // pour que tsx résolve les alias "@/..." via le tsconfig.json du dépôt.
  const tmpFile = join(process.cwd(), `.p26-mygo-config-check-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`)
  writeFileSync(
    tmpFile,
    `
import { MyGoDriver } from "./lib/hotel-suppliers/mygo/driver"
const driver = new MyGoDriver()
process.stdout.write(JSON.stringify({ status: driver.getConfigStatus(), isVirtual: driver.isVirtualMode() }))
`,
  )
  try {
    const out = execFileSync("npx", ["tsx", tmpFile], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: "utf-8",
      timeout: 20_000,
    })
    return JSON.parse(out.trim())
  } finally {
    rmSync(tmpFile, { force: true })
  }
}

test("MyGoDriver.getConfigStatus (process isolé) : mode live sans MYGO_LOGIN/MYGO_PASSWORD -> NOT_CONFIGURED", () => {
  const result = runInIsolatedProcess({ MYGO_MODE: "live", MYGO_LOGIN: "", MYGO_PASSWORD: "" })
  assert.equal(result.status, "NOT_CONFIGURED")
  assert.equal(result.isVirtual, false)
})

test("MyGoDriver.getConfigStatus (process isolé) : mode live avec credentials présents -> CONFIGURED, mode réel jamais confondu avec virtuel", () => {
  const result = runInIsolatedProcess({ MYGO_MODE: "live", MYGO_LOGIN: "real-login", MYGO_PASSWORD: "real-password" })
  assert.equal(result.status, "CONFIGURED")
  assert.equal(result.isVirtual, false)
})
