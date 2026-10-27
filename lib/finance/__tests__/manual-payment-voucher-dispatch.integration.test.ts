/**
 * VOUCHER-OMRA-PACKAGE-INTEGRATION-TESTS-01 — preuve d'intégration réelle
 * (pas seulement statique) pour les branches Omra/Package de
 * `verifyManualPayment` (lib/finance/manual-payment-actions.ts), ajoutées
 * par VOUCHER-DISPATCH-MULTIMODULE-01 (commit 632b1f9).
 *
 * `manual-payment-voucher-dispatch-wiring.test.ts` (même répertoire)
 * vérifie seulement que les bons motifs de code existent dans le fichier
 * source — aucune exécution réelle. Ce fichier-ci exécute réellement
 * `verifyManualPayment` contre un vrai Postgres (rôle `app_runtime`,
 * non-BYPASSRLS, même convention que `customer-topup-manual.integration.test.ts`)
 * et vérifie l'événement Inngest RÉELLEMENT émis, pas seulement l'intention
 * du code.
 *
 * Deux dépendances de `verifyManualPayment` ne sont pas appelables hors
 * session HTTP réelle : `createServerSupabase()` (lib/supabase/server.ts)
 * et `getCurrentAdminProfile()` (lib/auth/profile.ts). Interceptées via
 * `t.mock.module()` (Node --experimental-test-module-mocks) — PAS
 * `t.mock.method()`, qui ne peut pas remplacer un export de fonction ESM
 * non reconfigurable (voir lib/crm/__tests__/campaign-delivery-core.test.ts:66
 * pour le précédent documenté de cette limite dans ce dépôt). Aucun fichier
 * applicatif n'est modifié : `verifyManualPayment` reste strictement celle
 * qui tourne en production, seules ses deux dépendances de session sont
 * substituées au niveau du graphe de modules, avant import dynamique.
 *
 * L'événement Inngest réellement envoyé est capturé en monkey-patchant
 * `inngest.send` (propriété d'objet, pas un export de fonction — mutation
 * d'instance, pas une réaffectation de binding ESM, donc hors de la même
 * limite). Restauré systématiquement via `t.after()`.
 *
 * Les deux techniques ont été vérifiées sur un cas minimal avant l'écriture
 * de ce fichier (voir le rapport du chantier) : `verifyManualPayment` exécutée
 * réellement, résultat `{ok:true, fullyPaid:true}`, événement
 * `booking/omra.confirmed` capturé avec les données exactes des fixtures.
 */

import test, { before } from "node:test"
import type { TestContext } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"

import { withSystemContext } from "@/lib/db/tenant-context"
import {
  agencies,
  auditEvents,
  catalogPackages,
  customers,
  omraPackages,
  partnerInvoices,
  payments,
  reservationOmra,
  reservationPackage,
  reservations,
  reservationStatusHistory,
} from "@/lib/db/schema"
import { inngest } from "@/lib/inngest/client"
import type { VerifyManualPaymentResult } from "../manual-payment-actions"

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
const skip = () =>
  "Postgres local indisponible (DATABASE_URL) — voir commission-reversal-integration.test.ts pour la procédure."

before(async () => {
  dbAvailable = await isDbAvailable()
})

/* -------------------------------------------------------------------------- */
/* Interception — session (t.mock.module) + événement Inngest (monkey-patch) */
/* -------------------------------------------------------------------------- */

interface Session {
  authUserId: string
  role: "super_admin" | "manager" | "agent_compta"
  agencyId: string
}

/**
 * Remplace createServerSupabase/getCurrentAdminProfile pour la durée du
 * test (restauration automatique par t.mock, propre à chaque TestContext),
 * et monkey-patch inngest.send pour capturer les events réellement envoyés.
 * Retourne verifyManualPayment importée APRÈS la pose des mocks (le graphe
 * de modules doit voir les mocks avant la résolution des imports).
 */
async function setupInterception(
  t: TestContext,
  session: Session,
): Promise<{
  verifyManualPayment: (
    input: Parameters<
      typeof import("../manual-payment-actions").verifyManualPayment
    >[0],
  ) => Promise<VerifyManualPaymentResult>
  captured: Array<{ name: string; data: unknown }>
}> {
  const captured: Array<{ name: string; data: unknown }> = []
  const originalSend = inngest.send
  // Monkey-patch délibéré, mutation d'objet (pas un export ESM) — voir
  // commentaire d'en-tête du fichier.
  inngest.send = async (payload: { name: string; data: unknown }) => {
    captured.push(payload)
    return { ids: ["test"] }
  }
  t.after(() => {
    inngest.send = originalSend
  })

  t.mock.module("@/lib/supabase/server", {
    namedExports: {
      createServerSupabase: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: { id: session.authUserId } },
          }),
        },
      }),
    },
  })
  t.mock.module("@/lib/auth/profile", {
    namedExports: {
      getCurrentAdminProfile: async () => ({
        role: session.role,
        agencyId: session.agencyId,
      }),
    },
  })

  const mod = await import("../manual-payment-actions")
  return { verifyManualPayment: mod.verifyManualPayment, captured }
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

interface OmraFixture {
  agencyId: string
  customerId: string
  authUserId: string
  reservationId: string
  omraPackageId: string
}

async function createOmraFixture(
  opts: { tndAmount?: string; validOmraPackage?: boolean } = {},
): Promise<OmraFixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const authUserId = randomUUID()
  const reservationId = randomUUID()
  const omraPackageId = randomUUID()
  const validOmraPackage = opts.validOmraPackage ?? true
  const tndAmount = opts.tndAmount ?? "2000.00"

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `voucher-dispatch-omra-${agencyId.slice(0, 8)}`,
      name: "VOUCHER-OMRA-PACKAGE-INTEGRATION-TESTS-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Omra",
      email: `omra-${customerId.slice(0, 8)}@example.test`,
      phone: "20000000",
    })
    if (validOmraPackage) {
      await tx.insert(omraPackages).values({
        id: omraPackageId,
        agencyId,
        type: "omra",
        name: "Omra Ramadan — Test Fixture",
        durationDays: 10,
        validFrom: "2027-01-01",
        validUntil: "2027-12-31",
        basePrice: "1000.000",
      })
    }
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "omra",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: tndAmount,
      tndAmount,
      publicRef: `TST-OMRA-${reservationId.slice(0, 8)}`,
      guestAccessToken: randomUUID(),
    })
    await tx.insert(reservationOmra).values({
      reservationId,
      agencyId,
      // Si validOmraPackage=false, référence volontairement une ligne
      // omra_packages inexistante — simule un catalogue supprimé après la
      // réservation (reservationOmra.omraPackageId n'a pas de contrainte FK,
      // vérifié dans lib/db/schema/omra.ts).
      omraPackageId: validOmraPackage ? omraPackageId : randomUUID(),
      departureDate: "2027-03-01",
      returnDate: "2027-03-11",
      pilgrims: 2,
    })
  })

  return { agencyId, customerId, authUserId, reservationId, omraPackageId }
}

interface PackageFixture {
  agencyId: string
  customerId: string
  authUserId: string
  reservationId: string
  catalogPackageId: string
}

async function createPackageFixture(
  opts: { tndAmount?: string; validCatalogPackage?: boolean } = {},
): Promise<PackageFixture> {
  const agencyId = randomUUID()
  const customerId = randomUUID()
  const authUserId = randomUUID()
  const reservationId = randomUUID()
  const catalogPackageId = randomUUID()
  const validCatalogPackage = opts.validCatalogPackage ?? true
  const tndAmount = opts.tndAmount ?? "3000.00"

  await withSystemContext(async (tx) => {
    await tx.insert(agencies).values({
      id: agencyId,
      slug: `voucher-dispatch-pkg-${agencyId.slice(0, 8)}`,
      name: "VOUCHER-OMRA-PACKAGE-INTEGRATION-TESTS-01 — agence test",
      agencyType: "ota",
    })
    await tx.insert(customers).values({
      id: customerId,
      agencyId,
      firstName: "Test",
      lastName: "Package",
      email: `pkg-${customerId.slice(0, 8)}@example.test`,
      phone: "20000001",
    })
    if (validCatalogPackage) {
      await tx.insert(catalogPackages).values({
        id: catalogPackageId,
        agencyId,
        code: `PKG-${catalogPackageId.slice(0, 8)}`,
        title: "Istanbul Découverte — Test Fixture",
        slug: `istanbul-decouverte-${catalogPackageId.slice(0, 8)}`,
      })
    }
    await tx.insert(reservations).values({
      id: reservationId,
      agencyId,
      customerId,
      module: "package",
      source: "manual",
      status: "pending",
      originalCurrency: "TND",
      originalAmount: tndAmount,
      tndAmount,
      publicRef: `TST-PKG-${reservationId.slice(0, 8)}`,
      guestAccessToken: randomUUID(),
    })
    await tx.insert(reservationPackage).values({
      reservationId,
      agencyId,
      packageId: validCatalogPackage ? catalogPackageId : randomUUID(),
      departureId: randomUUID(),
      departureDate: "2027-05-01",
      returnDate: "2027-05-08",
      adults: 2,
      childrenAges: [8],
    })
  })

  return {
    agencyId,
    customerId,
    authUserId,
    reservationId,
    catalogPackageId,
  }
}

async function cleanupReservation(reservationId: string): Promise<void> {
  await withSystemContext(async (tx) => {
    // generateInvoiceForReservation (appelée par verifyManualPayment sur
    // fullyPaid) insère dans partner_invoices — FK reservation_id, à
    // nettoyer avant la réservation elle-même.
    await tx
      .delete(partnerInvoices)
      .where(eq(partnerInvoices.reservationId, reservationId))
    await tx.delete(payments).where(eq(payments.reservationId, reservationId))
    await tx.delete(auditEvents).where(eq(auditEvents.entityId, reservationId))
    await tx
      .delete(reservationStatusHistory)
      .where(eq(reservationStatusHistory.reservationId, reservationId))
    await tx
      .delete(reservationOmra)
      .where(eq(reservationOmra.reservationId, reservationId))
    await tx
      .delete(reservationPackage)
      .where(eq(reservationPackage.reservationId, reservationId))
    await tx.delete(reservations).where(eq(reservations.id, reservationId))
  })
}

async function cleanupAgency(
  agencyId: string,
  customerId: string,
  opts: { omraPackageId?: string; catalogPackageId?: string } = {},
): Promise<void> {
  await withSystemContext(async (tx) => {
    if (opts.omraPackageId) {
      await tx
        .delete(omraPackages)
        .where(eq(omraPackages.id, opts.omraPackageId))
    }
    if (opts.catalogPackageId) {
      await tx
        .delete(catalogPackages)
        .where(eq(catalogPackages.id, opts.catalogPackageId))
    }
    await tx.delete(customers).where(eq(customers.id, customerId))
    await tx.delete(agencies).where(eq(agencies.id, agencyId))
  })
}

/* -------------------------------------------------------------------------- */
/* Scénario 1 — paiement intégral Omra                                       */
/* -------------------------------------------------------------------------- */

test("Omra — paiement intégral : booking/omra.confirmed émis avec les données exactes des fixtures", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const fx = await createOmraFixture()
  t.after(() => cleanupReservation(fx.reservationId))
  t.after(() =>
    cleanupAgency(fx.agencyId, fx.customerId, {
      omraPackageId: fx.omraPackageId,
    }),
  )

  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "OMRA-FULL-001",
    amountTnd: 2000,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.fullyPaid, true)
  assert.equal(result.paymentState, "FULLY_PAID")

  assert.equal(captured.length, 1)
  assert.equal(captured[0]?.name, "booking/omra.confirmed")
  const data = captured[0]?.data as Record<string, unknown>
  assert.equal(data.reservationId, fx.reservationId)
  assert.equal(data.packageName, "Omra Ramadan — Test Fixture")
  assert.equal(data.pilgrimsCount, 2)
  assert.equal(data.departureDate, "2027-03-01")
  assert.equal(data.totalTnd, 2000)
  assert.equal(
    data.contactEmail,
    `omra-${fx.customerId.slice(0, 8)}@example.test`,
  )

  const [row] = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, fx.reservationId)),
  )
  assert.equal(row?.status, "confirmed")
})

/* -------------------------------------------------------------------------- */
/* Scénario 2 — paiement intégral Package                                    */
/* -------------------------------------------------------------------------- */

test("Package — paiement intégral : booking/package.confirmed émis, paxCount = adults + childrenAges.length", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const fx = await createPackageFixture()
  t.after(() => cleanupReservation(fx.reservationId))
  t.after(() =>
    cleanupAgency(fx.agencyId, fx.customerId, {
      catalogPackageId: fx.catalogPackageId,
    }),
  )

  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "PKG-FULL-001",
    amountTnd: 3000,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.fullyPaid, true)

  assert.equal(captured.length, 1)
  assert.equal(captured[0]?.name, "booking/package.confirmed")
  const data = captured[0]?.data as Record<string, unknown>
  assert.equal(data.packageName, "Istanbul Découverte — Test Fixture")
  assert.equal(data.departureDate, "2027-05-01")
  // adults=2 + childrenAges=[8] (1 enfant) => paxCount attendu = 3, calculé
  // depuis les fixtures réellement insérées, pas une constante recopiée.
  assert.equal(data.paxCount, 3)
  assert.equal(data.totalTnd, 3000)
})

/* -------------------------------------------------------------------------- */
/* Scénario 3 — paiement partiel : aucune confirmation prématurée            */
/* -------------------------------------------------------------------------- */

test("Omra — paiement partiel : aucun event, réservation reste pending, aucun voucher prématuré", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const fx = await createOmraFixture({ tndAmount: "2000.00" })
  t.after(() => cleanupReservation(fx.reservationId))
  t.after(() =>
    cleanupAgency(fx.agencyId, fx.customerId, {
      omraPackageId: fx.omraPackageId,
    }),
  )

  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "OMRA-PARTIAL-001",
    amountTnd: 500, // < 2000 attendu
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.fullyPaid, false)
  assert.equal(result.paymentState, "PARTIALLY_PAID")
  assert.equal(result.remainingTnd, 1500)

  assert.equal(
    captured.length,
    0,
    "aucun event ne doit être émis pour un acompte partiel",
  )

  const [row] = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, fx.reservationId)),
  )
  assert.equal(
    row?.status,
    "pending",
    "jamais confirmée sur un acompte partiel",
  )
})

/* -------------------------------------------------------------------------- */
/* Scénario 4 — catalogue supprimé : aucune donnée inventée, log explicite   */
/* -------------------------------------------------------------------------- */

test("Omra — package catalogue absent (supprimé après réservation) : aucun event, log explicite, réservation tout de même confirmée", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const fx = await createOmraFixture({ validOmraPackage: false })
  t.after(() => cleanupReservation(fx.reservationId))
  t.after(() => cleanupAgency(fx.agencyId, fx.customerId))

  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const errorCalls: unknown[][] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => {
    errorCalls.push(args)
  }
  t.after(() => {
    console.error = originalError
  })

  const result = await verifyManualPayment({
    reservationId: fx.reservationId,
    method: "transfer",
    reference: "OMRA-NOCATALOG-001",
    amountTnd: 2000,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(
    result.fullyPaid,
    true,
    "le paiement reste financièrement correct même si le catalogue est absent",
  )

  assert.equal(
    captured.length,
    0,
    "aucune donnée de voucher ne doit être inventée pour un package introuvable",
  )

  const loggedMissingOmra = errorCalls.some((args) =>
    args.some(
      (a) =>
        typeof a === "string" &&
        a.includes("booking/omra.confirmed non envoyé"),
    ),
  )
  assert.equal(
    loggedMissingOmra,
    true,
    "l'absence d'envoi doit être explicitement loggée, jamais silencieuse",
  )

  const [row] = await withSystemContext((tx) =>
    tx
      .select({ status: reservations.status })
      .from(reservations)
      .where(eq(reservations.id, fx.reservationId)),
  )
  assert.equal(
    row?.status,
    "confirmed",
    "le paiement lui-même reste correct et indépendant du voucher",
  )
})

/* -------------------------------------------------------------------------- */
/* Scénario 5 — rejeu : les DEUX couches de protection réelles, honnêtement  */
/* -------------------------------------------------------------------------- */
/*
 * Découvert en exécutant ce test contre Postgres (pas supposé à l'avance) :
 * le code réel a DEUX couches de protection contre un rejeu, pas une seule,
 * et elles s'activent dans des circonstances différentes :
 *   5a. Après un paiement INTÉGRAL (réservation déjà "confirmed"), un rejeu
 *       est bloqué par la garde de statut (`row.status !== "pending"`) AVANT
 *       même d'atteindre la contrainte d'unicité — code NOT_PENDING, jamais
 *       ALREADY_PROCESSED. C'est le chemin réel pour un double-clic après
 *       confirmation.
 *   5b. Avec un paiement PARTIEL (réservation reste "pending"), un rejeu de
 *       la même tentative (même référence) atteint réellement la contrainte
 *       unique `payments_capture_idempotency_uniq` — code ALREADY_PROCESSED.
 *       C'est le chemin qui protège contre une double soumission/validation
 *       concurrente pendant qu'un dossier reste encore en cours de paiement.
 * Un seul scénario ne peut pas honnêtement représenter les deux — d'où 5a/5b.
 */

test("5a — Package, rejeu après paiement intégral : NOT_PENDING (garde de statut), 1 seul event au total", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const fx = await createPackageFixture()
  t.after(() => cleanupReservation(fx.reservationId))
  t.after(() =>
    cleanupAgency(fx.agencyId, fx.customerId, {
      catalogPackageId: fx.catalogPackageId,
    }),
  )

  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const input = {
    reservationId: fx.reservationId,
    method: "transfer" as const,
    reference: "PKG-REPLAY-FULL-001",
    amountTnd: 3000,
  }

  const first = await verifyManualPayment(input)
  assert.equal(first.ok, true)
  if (first.ok) assert.equal(first.fullyPaid, true)

  const second = await verifyManualPayment(input)
  assert.equal(second.ok, false)
  if (!second.ok) assert.equal(second.code, "NOT_PENDING")

  const paymentRows = await withSystemContext((tx) =>
    tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.reservationId, fx.reservationId)),
  )
  assert.equal(
    paymentRows.length,
    1,
    "une seule ligne payments capturée malgré le rejeu",
  )
  assert.equal(
    captured.length,
    1,
    "le rejeu après confirmation ne doit jamais ré-émettre un second event",
  )
})

test("5b — Omra, rejeu d'un paiement partiel (réservation encore pending) : ALREADY_PROCESSED via la contrainte d'unicité réelle, aucun event dans les deux cas", async (t) => {
  if (!dbAvailable) return void t.skip(skip())

  const fx = await createOmraFixture({ tndAmount: "2000.00" })
  t.after(() => cleanupReservation(fx.reservationId))
  t.after(() =>
    cleanupAgency(fx.agencyId, fx.customerId, {
      omraPackageId: fx.omraPackageId,
    }),
  )

  const { verifyManualPayment, captured } = await setupInterception(t, {
    authUserId: fx.authUserId,
    role: "super_admin",
    agencyId: fx.agencyId,
  })

  const input = {
    reservationId: fx.reservationId,
    method: "transfer" as const,
    reference: "OMRA-REPLAY-PARTIAL-001",
    amountTnd: 500, // < 2000 — réservation reste "pending" après le 1er appel
  }

  const first = await verifyManualPayment(input)
  assert.equal(first.ok, true)
  if (first.ok) assert.equal(first.fullyPaid, false)

  const second = await verifyManualPayment(input)
  assert.equal(second.ok, false)
  if (!second.ok) assert.equal(second.code, "ALREADY_PROCESSED")

  const paymentRows = await withSystemContext((tx) =>
    tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.reservationId, fx.reservationId)),
  )
  assert.equal(
    paymentRows.length,
    1,
    "la contrainte payments_capture_idempotency_uniq bloque la 2e capture",
  )
  assert.equal(
    captured.length,
    0,
    "aucun paiement n'est intégral ici — aucun event ne doit jamais être émis",
  )
})
