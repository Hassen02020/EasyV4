/**
 * ECON-BREAKDOWN-01 — preuve live (Postgres réel) de l'invariant
 * docs/ECONOMIC_MODEL.md §3.2.1 ("Σ des droits = prix client") pour le
 * "Network/TND reference case" : le SEUL cas que le code réel
 * (`lib/network/product-booking-actions.ts`) supporte aujourd'hui —
 * `product.costPrice` traité comme déjà en TND, `product.costCurrency`
 * jamais lu (voir "CURRENT ASSUMPTION — NOT ENFORCED" dans ce fichier).
 *
 * CE QUE CE TEST PROUVE :
 *  - `recordReservationFinancials()` écrit, dans la même transaction que
 *    `reservation_financials`, exactement les lignes `economic_entitlements`
 *    passées en entrée, avec `status = 'earned'` ;
 *  - pour le triplet Network (supplier_cost / seller_margin net de
 *    commission / commission easy2book), Σ `economic_entitlements.amount`
 *    (toutes en devise 'TND', colonne `currency`) == `reservation_financials
 *    .sale_price_tnd` EXACTEMENT (même valeur numérique, pas une
 *    contre-valeur convertie) ;
 *  - la RLS tenant-isolation sur `economic_entitlements` suit le même
 *    pattern que `reservation_financials`/`reservation_network_product`
 *    (EXISTS via reservations.agency_id) : une autre agence ne voit aucune
 *    ligne, super_admin les voit toutes.
 *
 * CE QUE CE TEST NE PROUVE PAS (explicitement hors scope ici) :
 *  - AUCUNE preuve multi-devise générale. `amount`/`currency` de chaque
 *    ligne sont ici directement en TND parce que c'est ce que fait le code
 *    réel aujourd'hui — pas parce qu'une conversion `original_currency` →
 *    devise économique → devise comptable a été exercée. Il n'existe
 *    aujourd'hui, dans `product-booking-actions.ts`, ni lecture de
 *    `product.costCurrency`, ni taux de change, ni contre-valeur distincte :
 *    le sujet devise complet (par module, taux daté, arrondi, application)
 *    est un futur chantier nommé `CURRENCY-DIM-01`, distinct de celui-ci.
 *  - AUCUNE preuve que `product.costCurrency` est verrouillé à 'TND' — ce
 *    n'est vrai ni au niveau schéma (colonne nullable sans CHECK) ni au
 *    niveau code (le call site ne la lit jamais). C'est une hypothèse non
 *    appliquée ("CURRENT ASSUMPTION — NOT ENFORCED"), documentée, pas prouvée.
 *
 * Même convention que les autres suites `*-core.test.ts`/`reconciliation
 * .test.ts` de ce projet : se dégrade en `skip` sans DATABASE_URL/Postgres
 * local disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { asc, eq, sql } from "drizzle-orm"
import { withSystemContext, withTenantContext, type TenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  customers,
  reservations,
  reservationFinancials,
  economicEntitlements,
} from "@/lib/db/schema"
import { recordReservationFinancials } from "../reservation-financials"

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

let agencyA = "" // vendeur réel (revendeur Network)
let agencyB = "" // agence tierce, pour la preuve d'isolation RLS
let customerId = ""
let reservationId = ""

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()
  customerId = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      {
        id: agencyA,
        name: "ECON-BREAKDOWN-01 Agency A (reseller)",
        agencyType: "partner",
        slug: `econ-breakdown-a-${agencyA.slice(0, 8)}`,
      },
      {
        id: agencyB,
        name: "ECON-BREAKDOWN-01 Agency B (isolation)",
        agencyType: "partner",
        slug: `econ-breakdown-b-${agencyB.slice(0, 8)}`,
      },
    ])
    await tx.insert(customers).values({
      id: customerId,
      agencyId: agencyA,
      firstName: "Test",
      lastName: "EconBreakdown",
    })
  })

  // Réservation créée DANS le contexte tenant d'agencyA (comme le ferait
  // createNetworkProductBooking réel) pour que la RLS WITH CHECK de
  // `reservations`/`reservation_financials`/`economic_entitlements` soit
  // exercée normalement, pas contournée par withSystemContext.
  const ctxA: TenantContext = { agencyId: agencyA, userId: randomUUID(), isSuperAdmin: false }
  reservationId = await withTenantContext(ctxA, async (tx) => {
    const [r] = await tx
      .insert(reservations)
      .values({
        agencyId: agencyA,
        publicRef: `EB-${randomUUID().slice(0, 8)}`,
        customerId,
        module: "network",
        source: "internal",
        status: "confirmed",
        originalCurrency: "TND",
        originalAmount: "770.00",
        tndAmount: "770.00",
      })
      .returning({ id: reservations.id })
    return r!.id
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    await tx.delete(economicEntitlements).where(eq(economicEntitlements.reservationId, reservationId))
    await tx.delete(reservationFinancials).where(eq(reservationFinancials.reservationId, reservationId))
    await tx.delete(reservations).where(eq(reservations.id, reservationId))
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("Network/TND reference case : recordReservationFinancials écrit reservation_financials + 3 lignes economic_entitlements dans la MÊME transaction, Σ amount == sale_price_tnd", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  // Reproduit EXACTEMENT le triplet construit par createNetworkProductBooking
  // (lib/network/product-booking-actions.ts) pour cost=700, marge 10% →
  // total=770, commissionPercent=20% → commissionAmount=14.
  const costPriceTnd = 700
  const totalTnd = 770
  const marginAmountTnd = totalTnd - costPriceTnd // 70
  const commissionPercent = 20
  const commissionAmountExpected =
    Math.round(marginAmountTnd * (commissionPercent / 100) * 100) / 100 // 14
  const supplierNodeId = randomUUID()

  const ctxA: TenantContext = { agencyId: agencyA, userId: randomUUID(), isSuperAdmin: false }

  const { commissionAmount } = await withTenantContext(ctxA, (tx) =>
    recordReservationFinancials({
      tx,
      reservationId,
      supplierPriceTnd: costPriceTnd,
      salePriceTnd: totalTnd,
      commissionPercent,
      economicEntitlements: [
        {
          partyType: "supplier_node",
          partyId: supplierNodeId,
          role: "supplier",
          qualification: "supplier_cost",
          amount: costPriceTnd,
          basis: "coût fournisseur réel (products.cost_price × quantité)",
        },
        {
          partyType: "agency",
          partyId: agencyA,
          role: "seller",
          qualification: "seller_margin",
          amount: marginAmountTnd - commissionAmountExpected,
          basis: "marge vendeur nette de commission (10% − commission 20%)",
        },
        {
          partyType: "easy2book",
          partyId: null,
          role: "easy2book",
          qualification: "commission",
          amount: commissionAmountExpected,
          basis: "commission Easy2Book sur marge (20% × marge)",
        },
      ],
    }),
  )
  assert.equal(commissionAmount, commissionAmountExpected)

  const [financials] = await withSystemContext((tx) =>
    tx.select().from(reservationFinancials).where(eq(reservationFinancials.reservationId, reservationId)),
  )
  assert.ok(financials, "reservation_financials doit avoir une ligne")
  assert.equal(Number(financials!.salePriceTnd), totalTnd)

  const rows = await withSystemContext((tx) =>
    tx
      .select()
      .from(economicEntitlements)
      .where(eq(economicEntitlements.reservationId, reservationId))
      .orderBy(asc(economicEntitlements.qualification)),
  )
  assert.equal(rows.length, 3, "exactement 3 lignes (supplier/seller/easy2book)")

  const sum = rows.reduce((acc, r) => acc + Number(r.amount), 0)
  // Σ des lignes == sale_price_tnd EXACTEMENT (même devise, même valeur
  // numérique — cas Network/TND, pas une contre-valeur convertie).
  assert.equal(Math.round(sum * 100) / 100, Number(financials!.salePriceTnd))

  for (const r of rows) {
    assert.equal(r.status, "earned")
    assert.equal(r.currency, "TND", "Network/TND reference case : toutes les lignes en TND")
    assert.ok(r.effectiveAt, "effectiveAt doit être renseigné")
  }

  const byQualification = Object.fromEntries(rows.map((r) => [r.qualification, r]))
  assert.equal(Number(byQualification["supplier_cost"]!.amount), costPriceTnd)
  assert.equal(byQualification["supplier_cost"]!.role, "supplier")
  assert.equal(byQualification["supplier_cost"]!.partyType, "supplier_node")
  assert.equal(byQualification["supplier_cost"]!.partyId, supplierNodeId)

  assert.equal(
    Number(byQualification["seller_margin"]!.amount),
    marginAmountTnd - commissionAmountExpected,
  )
  assert.equal(byQualification["seller_margin"]!.role, "seller")
  assert.equal(byQualification["seller_margin"]!.partyId, agencyA)

  assert.equal(Number(byQualification["commission"]!.amount), commissionAmountExpected)
  assert.equal(byQualification["commission"]!.role, "easy2book")
  assert.equal(byQualification["commission"]!.partyId, null)
})

test("RLS economic_entitlements_tenant_isolation : une agence tierce (agencyB) ne voit AUCUNE ligne ; super_admin les voit toutes — même pattern que reservation_financials/reservation_network_product", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ctxB: TenantContext = { agencyId: agencyB, userId: randomUUID(), isSuperAdmin: false }
  const rowsAsB = await withTenantContext(ctxB, (tx) =>
    tx.select().from(economicEntitlements).where(eq(economicEntitlements.reservationId, reservationId)),
  )
  assert.equal(rowsAsB.length, 0, "agencyB ne doit voir aucune ligne d'une réservation d'agencyA")

  const ctxA: TenantContext = { agencyId: agencyA, userId: randomUUID(), isSuperAdmin: false }
  const rowsAsA = await withTenantContext(ctxA, (tx) =>
    tx.select().from(economicEntitlements).where(eq(economicEntitlements.reservationId, reservationId)),
  )
  assert.equal(rowsAsA.length, 3, "agencyA (propriétaire de la réservation) doit voir ses 3 lignes")

  const rowsAsSuperAdmin = await withSystemContext((tx) =>
    tx.select().from(economicEntitlements).where(eq(economicEntitlements.reservationId, reservationId)),
  )
  assert.equal(rowsAsSuperAdmin.length, 3, "super_admin doit voir toutes les lignes, quelle que soit l'agence")
})

/**
 * Append-only au niveau APPLICATIF (statique, ne nécessite pas de DB).
 *
 * NB — LIMITE EXPLICITE : contrairement à `wallet_ledger`/
 * `partner_credit_movements`/`commission_settlement_entries` (0084,
 * LEDGER-INTEGRITY-01, PR #82), `economic_entitlements` n'a PAS reçu de
 * REVOKE UPDATE/DELETE au niveau privilèges Postgres dans ce chantier —
 * ça n'était pas dans le périmètre confié. `app_runtime` a donc
 * techniquement INSERT/SELECT/UPDATE/DELETE sur cette table (vérifié en
 * production : grants identiques aux autres tables métier). Cette preuve
 * est donc UNIQUEMENT une preuve de convention de code actuelle, pas une
 * preuve d'impossibilité au niveau base — à traiter par un futur chantier
 * du même type que LEDGER-INTEGRITY-01 si l'append-only doit devenir une
 * garantie DB, pas seulement applicative.
 */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

test("append-only APPLICATIF (limite : pas de REVOKE DB, voir commentaire ci-dessus) : aucun .update()/.delete() Drizzle sur economicEntitlements dans le code applicatif", () => {
  const ROOT = process.cwd()
  const appSources = ["lib", "app", "components"].flatMap((d) => sourceFiles(join(ROOT, d)))
  const offenders: string[] = []
  for (const file of appSources) {
    const src = readFileSync(file, "utf8")
    if (/\.(update|delete)\(\s*economicEntitlements\s*\)/.test(src)) offenders.push(file)
  }
  assert.deepEqual(offenders, [], "mutation de economic_entitlements interdite (append-only par convention, ECON-BREAKDOWN-01)")
})
