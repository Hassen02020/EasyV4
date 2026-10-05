/**
 * CANONICAL-HOTEL-01 — preuve live (Postgres réel) que
 * `persistCanonicalHotelMappings()` ferme réellement le gap CANONICAL
 * identifié par l'audit du 2026-10-01 : une identité Easy2Book stable,
 * partagée entre fournisseurs, persistée (pas seulement calculée en
 * mémoire par `mapping.ts`/`deduplication.ts`, inchangés par ce test).
 *
 * Mêmes conventions que les autres suites live de ce dépôt :
 *   - se dégrade en `skip` sans DATABASE_URL/Postgres local disponible ;
 *   - fixtures marquées d'un préfixe unique par run (randomUUID) pour un
 *     nettoyage précis, sans toucher aux autres données (ces tables ne sont
 *     pas partitionnées par agence — voir l'en-tête de la migration 0109).
 *
 * E1/E2/E3 de la proposition CANONICAL (§10) :
 *   E1 — un match EXACT cross-fournisseur persiste UNE identité partagée.
 *   E2 — revoir le même (supplier, code) ne crée jamais une deuxième identité.
 *   E3 — un match HIGH/MEDIUM/LOW n'est JAMAIS auto-persisté.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import {
  canonicalHotels,
  canonicalHotelSupplierMappings,
} from "@/lib/db/schema"
import { deduplicateHotels } from "../deduplication"
import { persistCanonicalHotelMappings } from "../canonical-persistence"
import type { NormalizedHotel } from "../types"

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

async function findMapping(supplier: string, supplierHotelCode: string) {
  const [row] = await withSystemContext((tx) =>
    tx
      .select({
        canonicalHotelId: canonicalHotelSupplierMappings.canonicalHotelId,
        confidence: canonicalHotelSupplierMappings.matchConfidence,
      })
      .from(canonicalHotelSupplierMappings)
      .where(
        and(
          eq(canonicalHotelSupplierMappings.supplier, supplier),
          eq(
            canonicalHotelSupplierMappings.supplierHotelCode,
            supplierHotelCode,
          ),
        ),
      ),
  )
  return row ?? null
}

const createdSuppliersAndCodes: { supplier: string; code: string }[] = []

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    for (const { supplier, code } of createdSuppliersAndCodes) {
      const [mapping] = await tx
        .select({
          canonicalHotelId: canonicalHotelSupplierMappings.canonicalHotelId,
        })
        .from(canonicalHotelSupplierMappings)
        .where(
          and(
            eq(canonicalHotelSupplierMappings.supplier, supplier),
            eq(canonicalHotelSupplierMappings.supplierHotelCode, code),
          ),
        )
      if (mapping) {
        await tx
          .delete(canonicalHotelSupplierMappings)
          .where(
            eq(
              canonicalHotelSupplierMappings.canonicalHotelId,
              mapping.canonicalHotelId,
            ),
          )
        await tx
          .delete(canonicalHotels)
          .where(eq(canonicalHotels.id, mapping.canonicalHotelId))
      }
    }
  })
})

before(async () => {
  dbAvailable = await isDbAvailable()
})

test("persistCanonicalHotelMappings : match EXACT cross-fournisseur (E1) => UNE identité canonical partagée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const run = randomUUID().slice(0, 8)
  const mygoCode = `MYGO-${run}`
  const cyberesaCode = `CYB-${run}`
  createdSuppliersAndCodes.push(
    { supplier: "mygo", code: mygoCode },
    { supplier: "cyberesa", code: cyberesaCode },
  )

  // Même fixture que deduplication.test.ts (El Mouradi Gammarth) — geo à
  // quelques mètres + nom identique => confidence EXACT par matchHotels().
  const mygoHotel: NormalizedHotel = {
    name: `El Mouradi Gammarth E2E ${run}`,
    city: "Gammarth",
    latitude: 36.9,
    longitude: 10.3,
    images: [],
    facilities: [],
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: mygoCode }],
  }
  const cyberesaHotel: NormalizedHotel = {
    name: `El Mouradi Gammarth E2E ${run}`,
    city: "Gammarth",
    latitude: 36.9002,
    longitude: 10.3001,
    images: [],
    facilities: [],
    supplierMappings: [
      { supplier: "cyberesa", supplierHotelCode: cyberesaCode },
    ],
  }

  const groups = deduplicateHotels([mygoHotel, cyberesaHotel], [])
  assert.equal(
    groups.length,
    1,
    "setup : les deux fixtures doivent former UN seul groupe (EXACT)",
  )

  await persistCanonicalHotelMappings(groups, randomUUID())

  const mygoMapping = await findMapping("mygo", mygoCode)
  const cyberesaMapping = await findMapping("cyberesa", cyberesaCode)

  assert.ok(mygoMapping, "le mapping mygo doit être persisté")
  assert.ok(cyberesaMapping, "le mapping cyberesa doit être persisté")
  assert.equal(
    mygoMapping!.canonicalHotelId,
    cyberesaMapping!.canonicalHotelId,
    "les deux fournisseurs doivent partager LA MÊME identité canonical (E1)",
  )
  assert.equal(mygoMapping!.confidence, "EXACT")
  assert.equal(cyberesaMapping!.confidence, "EXACT")
})

test("persistCanonicalHotelMappings : revoir le même (supplier, code) (E2) => jamais une deuxième identité", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const run = randomUUID().slice(0, 8)
  const code = `MYGO-${run}`
  createdSuppliersAndCodes.push({ supplier: "mygo", code })

  const hotel: NormalizedHotel = {
    name: `Hotel Idempotence E2E ${run}`,
    city: "Tunis",
    latitude: 36.8,
    longitude: 10.18,
    images: [],
    facilities: [],
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: code }],
  }

  // Deux "recherches" successives et indépendantes (même pattern que
  // production : runSearchThroughHub() est appelé à chaque requête,
  // persistCanonicalHotelMappings() avec des groupes recalculés à chaque fois).
  const firstGroups = deduplicateHotels([hotel], [])
  await persistCanonicalHotelMappings(firstGroups, randomUUID())
  const afterFirst = await findMapping("mygo", code)
  assert.ok(afterFirst, "la première recherche doit créer l'identité")

  const secondGroups = deduplicateHotels([hotel], [])
  await persistCanonicalHotelMappings(secondGroups, randomUUID())
  const afterSecond = await findMapping("mygo", code)

  assert.equal(
    afterSecond!.canonicalHotelId,
    afterFirst!.canonicalHotelId,
    "une deuxième recherche du même (supplier, code) doit réutiliser l'identité existante (E2)",
  )

  const allMappingsForCode = await withSystemContext((tx) =>
    tx
      .select({ id: canonicalHotelSupplierMappings.id })
      .from(canonicalHotelSupplierMappings)
      .where(
        and(
          eq(canonicalHotelSupplierMappings.supplier, "mygo"),
          eq(canonicalHotelSupplierMappings.supplierHotelCode, code),
        ),
      ),
  )
  assert.equal(
    allMappingsForCode.length,
    1,
    "jamais une deuxième ligne de mapping pour le même (supplier, code) — contrainte unique respectée",
  )
})

test("persistCanonicalHotelMappings : match HIGH/MEDIUM (E3) => jamais auto-persisté", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const run = randomUUID().slice(0, 8)
  const anchorCode = `MYGO-${run}`
  const highConfidenceCode = `CYB-${run}`
  createdSuppliersAndCodes.push(
    { supplier: "mygo", code: anchorCode },
    { supplier: "cyberesa", code: highConfidenceCode },
  )

  // Même ville + similarité de nom >= 0.75, SANS coordonnées (aucun signal
  // géo) => confidence HIGH par matchHotels() (règle "sameCity && similarity
  // >= 0.75"), jamais EXACT — isAutoMergeable(HIGH) reste vrai pour
  // l'affichage (même groupe), mais ce chantier ne persiste QUE EXACT.
  const anchor: NormalizedHotel = {
    name: `Hotel Haut Confiance E2E ${run}`,
    city: "Sousse",
    images: [],
    facilities: [],
    supplierMappings: [{ supplier: "mygo", supplierHotelCode: anchorCode }],
  }
  const highConfidenceMember: NormalizedHotel = {
    name: `Hotel Haut Confiance E2E ${run} Resort`,
    city: "Sousse",
    images: [],
    facilities: [],
    supplierMappings: [
      { supplier: "cyberesa", supplierHotelCode: highConfidenceCode },
    ],
  }

  const groups = deduplicateHotels([anchor, highConfidenceMember], [])
  assert.equal(
    groups.length,
    1,
    "setup : doit former un seul groupe (affichage)",
  )
  const nonAnchorConfidence = groups[0]!.members.find(
    (m) =>
      m.hotel.supplierMappings[0]?.supplierHotelCode === highConfidenceCode,
  )?.confidence
  assert.equal(
    nonAnchorConfidence,
    "HIGH",
    "setup : le deuxième membre doit être HIGH, pas EXACT",
  )

  await persistCanonicalHotelMappings(groups, randomUUID())

  const anchorMapping = await findMapping("mygo", anchorCode)
  const highConfidenceMapping = await findMapping(
    "cyberesa",
    highConfidenceCode,
  )

  assert.ok(
    anchorMapping,
    "l'ancre du groupe (confidence EXACT par construction) doit être persistée",
  )
  assert.equal(
    highConfidenceMapping,
    null,
    "un membre HIGH ne doit JAMAIS créer de mapping persisté (E3) — même si l'affichage le groupe",
  )
})
