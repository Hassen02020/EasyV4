/**
 * AGREEMENT-01 — preuve live (Postgres réel) de la capacité mécanique :
 *
 *  1. un super_admin PEUT créer un `commercial_agreements` (RLS
 *     `commercial_agreements_admin_write`, `is_super_admin()`) ;
 *  2. une agence (non super_admin) NE PEUT PAS créer/modifier un
 *     `commercial_agreements`, même le sien — [D-01a], AUCUNE exception
 *     agence sur cette table, contrairement à la quasi-totalité des tables
 *     multi-tenant de ce dépôt ;
 *  3. `margin_rules.agreement_id` pointe réellement vers un
 *     `commercial_agreements.id` (FK vivante), sans affecter
 *     `getMarginsForAgency()`/`applyMargin()` (colonne non lue par ces
 *     fonctions, confirmé par lecture complète avant ce chantier).
 *
 * IMPORTANT — décision Direction (2026-09-30) : tout ce qui est créé ici
 * est une FIXTURE DE TEST, nettoyée en `after()`. Ce n'est PAS le premier
 * accord commercial réel — celui-ci reste BLOQUÉ tant que la Direction n'a
 * pas tranché le taux D-01b (voir docs/ROADMAP.md, section AGREEMENT-01).
 * Aucune donnée créée par ce fichier n'est laissée en base après exécution.
 *
 * Même convention que `lib/finance/__tests__/economic-entitlements-network
 * .test.ts` : se dégrade en `skip` sans DATABASE_URL/Postgres local
 * disponible.
 */
import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import {
  withSystemContext,
  withTenantContext,
  type TenantContext,
} from "@/lib/db/tenant-context"
import { agencies, commercialAgreements } from "@/lib/db/schema"
import { marginRules } from "@/lib/db/schema/financials"

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
let createdAgreementIds: string[] = []
const createdMarginRuleIds: string[] = []

before(async () => {
  dbAvailable = await isDbAvailable()
  if (!dbAvailable) return

  agencyA = randomUUID()
  agencyB = randomUUID()

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values([
      {
        id: agencyA,
        name: "AGREEMENT-01 test Agency A (seller)",
        agencyType: "partner",
        slug: `agreement-01-a-${agencyA.slice(0, 8)}`,
      },
      {
        id: agencyB,
        name: "AGREEMENT-01 test Agency B (rejected writer)",
        agencyType: "partner",
        slug: `agreement-01-b-${agencyB.slice(0, 8)}`,
      },
    ])
  })
})

after(async () => {
  if (!dbAvailable) return
  await withSystemContext(async (tx) => {
    for (const id of createdMarginRuleIds) {
      await tx.delete(marginRules).where(eq(marginRules.id, id))
    }
    for (const id of createdAgreementIds) {
      await tx
        .delete(commercialAgreements)
        .where(eq(commercialAgreements.id, id))
    }
    await tx.delete(agencies).where(eq(agencies.id, agencyA))
    await tx.delete(agencies).where(eq(agencies.id, agencyB))
  })
})

test("commercial_agreements : un super_admin PEUT créer un accord (RLS commercial_agreements_admin_write)", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ctxSuperAdmin: TenantContext = {
    agencyId: null,
    userId: randomUUID(),
    isSuperAdmin: true,
  }
  const agreementId = await withTenantContext(ctxSuperAdmin, async (tx) => {
    const [row] = await tx
      .insert(commercialAgreements)
      .values({
        sellerPartyType: "agency",
        sellerPartyId: agencyA,
        easy2bookRole: "platform",
        channel: "network",
        currency: "TND",
        payerRole: "customer",
        status: "draft",
        createdByUserId: ctxSuperAdmin.userId,
      })
      .returning({ id: commercialAgreements.id })
    return row!.id
  })
  createdAgreementIds.push(agreementId)

  const [row] = await withSystemContext((tx) =>
    tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.id, agreementId)),
  )
  assert.ok(row, "l'accord doit exister en base")
  assert.equal(row!.sellerPartyType, "agency")
  assert.equal(row!.sellerPartyId, agencyA)
  assert.equal(row!.easy2bookRole, "platform")
  assert.equal(row!.status, "draft")
})

test("commercial_agreements : une agence (non super_admin) NE PEUT PAS créer un accord, même pour elle-même — [D-01a], RLS rejette", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ctxAgencyA: TenantContext = {
    agencyId: agencyA,
    userId: randomUUID(),
    isSuperAdmin: false,
  }

  await assert.rejects(
    () =>
      withTenantContext(ctxAgencyA, (tx) =>
        tx.insert(commercialAgreements).values({
          sellerPartyType: "agency",
          sellerPartyId: agencyA,
          easy2bookRole: "platform",
          channel: "network",
          currency: "TND",
          payerRole: "customer",
          status: "draft",
          createdByUserId: ctxAgencyA.userId,
        }),
      ),
    (err: unknown) => {
      // drizzle-orm@0.45 (postgres-js driver) wraps the real Postgres error
      // in `DrizzleQueryError`, whose own `.message` is "Failed query: ...
      // params: ..." — the actual RLS text ("new row violates row-level
      // security policy") lives on `.cause.message`, not on the outer
      // error's `.message`, so a plain regex against `err` never matches.
      const causeMessage =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : ""
      assert.match(causeMessage, /row-level security|new row violates/i)
      return true
    },
    "l'INSERT d'une agence non super_admin doit être rejeté par la policy RLS WITH CHECK (is_super_admin())",
  )
})

test("commercial_agreements : une agence (non super_admin) NE PEUT PAS modifier un accord existant, même en lecture d'une ligne qu'elle voit — [D-01a]", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ctxSuperAdmin: TenantContext = {
    agencyId: null,
    userId: randomUUID(),
    isSuperAdmin: true,
  }
  const agreementId = await withTenantContext(ctxSuperAdmin, async (tx) => {
    const [row] = await tx
      .insert(commercialAgreements)
      .values({
        sellerPartyType: "agency",
        sellerPartyId: agencyA,
        easy2bookRole: "distributor",
        channel: "b2b",
        currency: "TND",
        payerRole: "customer",
        status: "draft",
        createdByUserId: ctxSuperAdmin.userId,
      })
      .returning({ id: commercialAgreements.id })
    return row!.id
  })
  createdAgreementIds.push(agreementId)

  // agencyA est la seller_party de cet accord : la policy de LECTURE élargie
  // doit lui permettre de le voir...
  const ctxAgencyA: TenantContext = {
    agencyId: agencyA,
    userId: randomUUID(),
    isSuperAdmin: false,
  }
  const visible = await withTenantContext(ctxAgencyA, (tx) =>
    tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.id, agreementId)),
  )
  assert.equal(
    visible.length,
    1,
    "agencyA (seller_party) doit voir l'accord en lecture",
  )

  // ...mais ne doit JAMAIS pouvoir le modifier, même étant partie prenante.
  const updateResult = await withTenantContext(ctxAgencyA, (tx) =>
    tx
      .update(commercialAgreements)
      .set({ status: "active" })
      .where(eq(commercialAgreements.id, agreementId))
      .returning({ id: commercialAgreements.id }),
  )
  assert.equal(
    updateResult.length,
    0,
    "UPDATE par une agence, même seller_party, doit être silencieusement filtré par RLS (0 ligne affectée)",
  )

  const [stillDraft] = await withSystemContext((tx) =>
    tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.id, agreementId)),
  )
  assert.equal(
    stillDraft!.status,
    "draft",
    "le statut ne doit pas avoir changé",
  )
})

test("commercial_agreements : une agence tierce (agencyB, non partie prenante) ne voit AUCUN accord d'agencyA", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ctxSuperAdmin: TenantContext = {
    agencyId: null,
    userId: randomUUID(),
    isSuperAdmin: true,
  }
  const agreementId = await withTenantContext(ctxSuperAdmin, async (tx) => {
    const [row] = await tx
      .insert(commercialAgreements)
      .values({
        sellerPartyType: "agency",
        sellerPartyId: agencyA,
        easy2bookRole: "platform",
        channel: "network",
        currency: "TND",
        payerRole: "customer",
        status: "draft",
        createdByUserId: ctxSuperAdmin.userId,
      })
      .returning({ id: commercialAgreements.id })
    return row!.id
  })
  createdAgreementIds.push(agreementId)

  const ctxAgencyB: TenantContext = {
    agencyId: agencyB,
    userId: randomUUID(),
    isSuperAdmin: false,
  }
  const rowsAsB = await withTenantContext(ctxAgencyB, (tx) =>
    tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.id, agreementId)),
  )
  assert.equal(
    rowsAsB.length,
    0,
    "agencyB n'est partie prenante d'aucun rôle de cet accord : 0 ligne visible",
  )
})

test("margin_rules.agreement_id : FK vivante vers commercial_agreements, colonne invisible à getMarginsForAgency()/applyMargin() — fixture nettoyée, PAS un accord réel", async (t) => {
  if (!dbAvailable) return void t.skip(skipReason())

  const ctxSuperAdmin: TenantContext = {
    agencyId: null,
    userId: randomUUID(),
    isSuperAdmin: true,
  }
  const agreementId = await withTenantContext(ctxSuperAdmin, async (tx) => {
    const [row] = await tx
      .insert(commercialAgreements)
      .values({
        sellerPartyType: "agency",
        sellerPartyId: agencyA,
        easy2bookRole: "platform",
        channel: "network",
        currency: "TND",
        payerRole: "customer",
        status: "draft",
        createdByUserId: ctxSuperAdmin.userId,
      })
      .returning({ id: commercialAgreements.id })
    return row!.id
  })
  createdAgreementIds.push(agreementId)

  // Ligne margin_rules de TEST liée à l'accord — PAS le premier accord réel
  // Network (bloqué sur D-01b, voir docs/ROADMAP.md). Insérée en
  // withSystemContext (comme ECON-BREAKDOWN-01 le fait pour ses fixtures)
  // pour ne pas dépendre d'un futur write path applicatif qui n'existe pas
  // encore pour margin_rules (confirmé par l'audit : 0 écrivain aujourd'hui).
  const marginRuleId = await withSystemContext(async (tx) => {
    const [row] = await tx
      .insert(marginRules)
      .values({
        agencyId: agencyA,
        productType: "network",
        type: "percent",
        percentValue: "10.00",
        commissionPercent: "0.00", // fixture de test, PAS une politique commerciale réelle (D-01b bloquée)
        name: "AGREEMENT-01 test fixture — lien agreement_id (à nettoyer)",
        agreementId,
      })
      .returning({ id: marginRules.id })
    return row!.id
  })
  createdMarginRuleIds.push(marginRuleId)

  const [linked] = await withSystemContext((tx) =>
    tx.select().from(marginRules).where(eq(marginRules.id, marginRuleId)),
  )
  assert.equal(
    linked!.agreementId,
    agreementId,
    "margin_rules.agreement_id doit pointer vers le vrai commercial_agreements.id",
  )

  // Preuve ON DELETE SET NULL : supprimer l'accord ne doit PAS supprimer la
  // règle de marge, seulement détacher le lien.
  await withSystemContext((tx) =>
    tx
      .delete(commercialAgreements)
      .where(eq(commercialAgreements.id, agreementId)),
  )
  createdAgreementIds = createdAgreementIds.filter((id) => id !== agreementId)

  const [afterDelete] = await withSystemContext((tx) =>
    tx.select().from(marginRules).where(eq(marginRules.id, marginRuleId)),
  )
  assert.ok(
    afterDelete,
    "la ligne margin_rules doit survivre à la suppression de l'accord",
  )
  assert.equal(
    afterDelete!.agreementId,
    null,
    "ON DELETE SET NULL doit avoir détaché agreement_id",
  )
})
