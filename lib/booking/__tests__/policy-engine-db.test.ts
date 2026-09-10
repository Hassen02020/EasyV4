/**
 * PHASE "POLICY ENGINE OMRA/PACKAGE/ACTIVITY" — preuve live (DB réelle) que :
 *   - la résolution respecte la précédence spécifique > défaut agence >
 *     aucune politique (jamais une valeur inventée),
 *   - le versionnement ne modifie JAMAIS une ligne existante ("modifier" =
 *     nouvelle ligne, ancienne désactivée, historique conservé),
 *   - l'isolation tenant s'applique à `cancellation_policies` exactement
 *     comme au reste de la plateforme.
 *
 * Utilise les cœurs testables (`listCancellationPoliciesForAgency`,
 * `publishCancellationPolicyForAgency`, `deactivateCancellationPolicyForAgency`,
 * `resolveCancellationPolicy`) — isolés de `assertProductManager()` (session
 * Master Admin live), même principe que `customer-ownership.test.ts`.
 *
 * Se dégrade en `skip` sans Postgres local.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { agencies, cancellationPolicies, auditEvents } from "@/lib/db/schema"
import { resolveCancellationPolicy } from "../policy-engine"
import {
  listCancellationPoliciesForAgency,
  publishCancellationPolicyForAgency,
  deactivateCancellationPolicyForAgency,
} from "@/lib/admin/cancellation-policy-core"

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

let agencyA = ""
let agencyB = ""
const userId = randomUUID()

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return
  agencyA = randomUUID()
  agencyB = randomUUID()
  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      { id: agencyA, slug: `pe-a-${agencyA}`, name: "Policy Engine Test Agency A", agencyType: "ota" },
      { id: agencyB, slug: `pe-b-${agencyB}`, name: "Policy Engine Test Agency B", agencyType: "ota" },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(cancellationPolicies).where(eq(cancellationPolicies.agencyId, agencyA))
    await tx.delete(cancellationPolicies).where(eq(cancellationPolicies.agencyId, agencyB))
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyA))
    await tx.delete(auditEvents).where(eq(auditEvents.agencyId, agencyB))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("resolveCancellationPolicy : aucune politique publiée → null, jamais une valeur inventée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const productId = randomUUID()
  const result = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveCancellationPolicy(tx, { agencyId: agencyA, productType: "package", productId }),
  )
  assert.equal(result, null)
})

test("resolveCancellationPolicy : politique par défaut agence (productId=null) s'applique à un produit non ciblé spécifiquement", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await publishCancellationPolicyForAgency(agencyA, userId, {
    productType: "omra",
    productId: null,
    cancellable: true,
    modifiable: false,
    refundAllowed: true,
    creditAllowed: true,
    cancellationFeePercent: 10,
  })
  const productId = randomUUID()
  const result = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveCancellationPolicy(tx, { agencyId: agencyA, productType: "omra", productId }),
  )
  assert.ok(result)
  assert.equal(result!.productId, null)
  assert.equal(result!.cancellationFeePercent, 10)
})

test("resolveCancellationPolicy : politique spécifique à un produit prime sur le défaut agence", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const specificProductId = randomUUID()
  await publishCancellationPolicyForAgency(agencyA, userId, {
    productType: "activity",
    productId: null,
    cancellable: true,
    modifiable: false,
    refundAllowed: true,
    creditAllowed: true,
    cancellationFeePercent: 50,
  })
  await publishCancellationPolicyForAgency(agencyA, userId, {
    productType: "activity",
    productId: specificProductId,
    cancellable: true,
    modifiable: true,
    refundAllowed: true,
    creditAllowed: true,
    cancellationFeePercent: 0,
  })

  const specific = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveCancellationPolicy(tx, { agencyId: agencyA, productType: "activity", productId: specificProductId }),
  )
  assert.ok(specific)
  assert.equal(specific!.productId, specificProductId)
  assert.equal(specific!.cancellationFeePercent, 0)

  const otherProductId = randomUUID()
  const fallback = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveCancellationPolicy(tx, { agencyId: agencyA, productType: "activity", productId: otherProductId }),
  )
  assert.ok(fallback)
  assert.equal(fallback!.productId, null)
  assert.equal(fallback!.cancellationFeePercent, 50)
})

test("publishCancellationPolicyForAgency : versionnement — jamais un UPDATE, l'ancienne version reste consultable désactivée", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const productId = randomUUID()
  const v1 = await publishCancellationPolicyForAgency(agencyA, userId, {
    productType: "package",
    productId,
    cancellable: false,
    modifiable: false,
    refundAllowed: false,
    creditAllowed: false,
  })
  assert.equal(v1.version, 1)

  const v2 = await publishCancellationPolicyForAgency(agencyA, userId, {
    productType: "package",
    productId,
    cancellable: true,
    modifiable: true,
    refundAllowed: true,
    creditAllowed: true,
    cancellationFeePercent: 15,
  })
  assert.equal(v2.version, 2)
  assert.notEqual(v2.id, v1.id, "une nouvelle ligne est insérée, jamais un UPDATE de la précédente")

  const all = await listCancellationPoliciesForAgency(agencyA)
  const rowsForProduct = all.filter((r) => r.productId === productId && r.productType === "package")
  assert.equal(rowsForProduct.length, 2, "les deux versions restent en base")
  const active = rowsForProduct.filter((r) => r.isActive)
  assert.equal(active.length, 1, "une seule ligne active à la fois pour la même cible")
  assert.equal(active[0]!.version, 2)
  const oldVersion = rowsForProduct.find((r) => r.version === 1)
  assert.ok(oldVersion)
  assert.equal(oldVersion!.isActive, false, "l'ancienne version reste en base mais désactivée")
  assert.equal(oldVersion!.cancellable, false, "le contenu de l'ancienne version n'est jamais modifié rétroactivement")

  const resolved = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveCancellationPolicy(tx, { agencyId: agencyA, productType: "package", productId }),
  )
  assert.equal(resolved!.version, 2, "la résolution retourne toujours la dernière version active")
})

test("deactivateCancellationPolicyForAgency : désactive sans supprimer — le produit retombe sur le défaut agence (ou aucune politique)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const productId = randomUUID()
  const published = await publishCancellationPolicyForAgency(agencyA, userId, {
    productType: "omra",
    productId,
    cancellable: true,
    modifiable: false,
    refundAllowed: true,
    creditAllowed: true,
    cancellationFeePercent: 5,
  })

  await deactivateCancellationPolicyForAgency(agencyA, userId, published.id)

  const resolved = await withTenantContext({ agencyId: agencyA, userId: "", isSuperAdmin: false }, (tx) =>
    resolveCancellationPolicy(tx, { agencyId: agencyA, productType: "omra", productId }),
  )
  // Un défaut agence "omra" a été publié dans un test précédent — la
  // désactivation de la politique spécifique fait donc retomber sur lui,
  // jamais sur une valeur inventée localement.
  assert.ok(resolved === null || resolved!.productId === null)

  const all = await listCancellationPoliciesForAgency(agencyA)
  const row = all.find((r) => r.id === published.id)
  assert.ok(row, "la ligne désactivée reste en base (historique)")
  assert.equal(row!.isActive, false)
})

test("isolation tenant : une politique publiée pour l'agence A est invisible pour l'agence B", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const productId = randomUUID()
  await publishCancellationPolicyForAgency(agencyA, userId, {
    productType: "package",
    productId,
    cancellable: true,
    modifiable: false,
    refundAllowed: true,
    creditAllowed: true,
    cancellationFeePercent: 25,
  })

  const resolvedFromB = await withTenantContext({ agencyId: agencyB, userId: "", isSuperAdmin: false }, (tx) =>
    resolveCancellationPolicy(tx, { agencyId: agencyB, productType: "package", productId }),
  )
  assert.equal(resolvedFromB, null, "l'agence B ne voit jamais une politique publiée par l'agence A")

  const listB = await listCancellationPoliciesForAgency(agencyB)
  assert.equal(listB.filter((r) => r.productId === productId).length, 0)
})

test("publishCancellationPolicyForAgency : pourcentage de frais négatif → rejeté (Phase 38A, gap confirmé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  // Sans cette validation, un pourcentage négatif ferait dépasser
  // `creditableTnd` au montant réellement capturé lors de l'annulation
  // (`AMOUNT_EXCEEDS_CAPTURED`), cassant l'annulation en entier. Rejeté ici,
  // à la source, plutôt que de compter sur ce filet en aval.
  await assert.rejects(
    () =>
      publishCancellationPolicyForAgency(agencyA, userId, {
        productType: "activity",
        productId: randomUUID(),
        cancellable: true,
        modifiable: false,
        refundAllowed: true,
        creditAllowed: true,
        cancellationFeePercent: -10,
      }),
    /entre 0 et 100/,
  )
})

test("publishCancellationPolicyForAgency : pourcentage de frais > 100 → rejeté", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await assert.rejects(
    () =>
      publishCancellationPolicyForAgency(agencyA, userId, {
        productType: "activity",
        productId: randomUUID(),
        cancellable: true,
        modifiable: false,
        refundAllowed: true,
        creditAllowed: true,
        cancellationFeePercent: 150,
      }),
    /entre 0 et 100/,
  )
})

test("cancellation_policies : le CHECK en base rejette aussi un pourcentage négatif écrit hors de la fonction applicative (défense en profondeur)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  await assert.rejects(() =>
    withSystemContext((tx) =>
      tx.insert(cancellationPolicies).values({
        agencyId: agencyA,
        productType: "activity",
        productId: randomUUID(),
        version: 1,
        isActive: true,
        cancellable: true,
        modifiable: false,
        refundAllowed: true,
        creditAllowed: true,
        cancellationFeePercent: "-5",
      }),
    ),
  )
})

test("cancellation_policies : RLS force row level security est activé (Phase 38A, gap de cohérence confirmé)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())
  const [row] = await withSystemContext((tx) =>
    tx.execute(sql`select relforcerowsecurity from pg_class where relname = 'cancellation_policies'`),
  ) as unknown as Array<{ relforcerowsecurity: boolean }>
  assert.equal(row?.relforcerowsecurity, true, "cancellation_policies doit avoir FORCE ROW LEVEL SECURITY, comme les tables tenant-scopées sœurs")
})
