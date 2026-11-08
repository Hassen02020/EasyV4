/**
 * DATA-RETENTION-AND-DELETION-POLICY-01 — chaque table de la base est
 * rattachée à exactement une famille de docs/DATA_RETENTION_POLICY.md.
 * Une nouvelle table ajoutée au schéma sans être classée fait échouer ce test.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/** Tables créées uniquement par migration manuelle (absentes du schéma Drizzle). */
const MANUAL_ONLY_TABLES = [
  "supplier_settlements",
  "supplier_settlement_entries",
]

function schemaTables(): string[] {
  const files = [
    "lib/db/schema.ts",
    ...readdirSync("lib/db/schema")
      .filter((f) => f.endsWith(".ts"))
      .map((f) => join("lib/db/schema", f)),
  ]
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n")
  const names = [...src.matchAll(/pgTable\(\s*"([a-z_0-9]+)"/g)].map(
    (m) => m[1]!,
  )
  return [...new Set(names)]
}

function policyFamilies(): Map<string, string[]> {
  const doc = readFileSync("docs/DATA_RETENTION_POLICY.md", "utf8")
  const families = new Map<string, string[]>()
  let current: string | null = null
  for (const line of doc.split("\n")) {
    const h = /^### (F\d{2})\b/.exec(line)
    if (h) current = h[1]!
    if (current && line.startsWith("Tables :")) {
      const tables = [...line.matchAll(/`([a-z_0-9.]+)`/g)]
        .map((m) => m[1]!)
        .filter((t) => !t.includes("."))
      families.set(current, tables)
    }
  }
  return families
}

test("la politique décrit les familles F01 à F10, chacune avec ses six rubriques", () => {
  const doc = readFileSync("docs/DATA_RETENTION_POLICY.md", "utf8")
  const sections = doc.split(/^### /m).slice(1)
  const ids = sections.map((s) => s.slice(0, 3))
  assert.deepEqual(
    ids,
    Array.from({ length: 10 }, (_, i) => `F${String(i + 1).padStart(2, "0")}`),
  )
  for (const s of sections) {
    for (const rubric of [
      "1. **Durée",
      "2. **Responsable",
      "3. **Suppression",
      "4. **Blocage",
      "5. **Preuves",
      "6. **Purge automatique",
    ]) {
      assert.ok(
        s.includes(rubric),
        `${s.slice(0, 3)} : rubrique « ${rubric} » manquante`,
      )
    }
  }
})

test("chaque table du schéma est rattachée à exactement une famille", () => {
  const expected = [...schemaTables(), ...MANUAL_ONLY_TABLES].sort()
  assert.ok(expected.length >= 130, `inventaire inattendu : ${expected.length}`)
  const families = policyFamilies()
  const seen = new Map<string, string[]>()
  for (const [family, tables] of families) {
    for (const t of tables) seen.set(t, [...(seen.get(t) ?? []), family])
  }
  const missing = expected.filter((t) => !seen.has(t))
  const duplicated = [...seen].filter(([, f]) => f.length > 1)
  const unknown = [...seen.keys()].filter((t) => !expected.includes(t))
  assert.deepEqual(missing, [], "tables non classées")
  assert.deepEqual(duplicated, [], "tables classées dans plusieurs familles")
  assert.deepEqual(unknown, [], "tables citées mais absentes du schéma")
})

test("aucune durée chiffrée n'est présentée comme décidée", () => {
  const doc = readFileSync("docs/DATA_RETENTION_POLICY.md", "utf8")
  assert.match(doc, /Statut : PROJET — NON APPROUVÉ/)
  for (const block of doc.split(/^### /m).slice(1)) {
    const duree = /1\. \*\*Durée\*\* : ([^\n]+)/.exec(block)?.[1] ?? ""
    assert.ok(
      /À DÉCIDER|pas de durée liée aux personnes/.test(duree),
      `${block.slice(0, 3)} : durée non marquée À DÉCIDER`,
    )
  }
})
