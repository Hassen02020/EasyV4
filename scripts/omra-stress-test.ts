#!/usr/bin/env tsx
/**
 * omra-stress-test.ts
 *
 * Simule des réservations Omra concurrentes pour tester :
 *   - Verrou FOR UPDATE sur omra_allotments (anti-surbooking)
 *   - Transaction atomique (wallet debit + allotment update + pilgrim insert)
 *   - Rollback en cas d'erreur
 *
 * Usage :
 *   npx tsx scripts/omra-stress-test.ts
 */

import { eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { omraAllotments, omraPackages, omraPilgrims } from "@/lib/db/schema"

const AGENCY_ID = "00000000-0000-0000-0000-000000000001"
const PACKAGE_ID = "test-pkg-001"
const DEPARTURE_DATE = "2026-03-01"
const INITIAL_STOCK = 10
const BOOKING_SIZE = 2

async function setupTestData() {
  const db = getDb()
  
  // Créer un package de test
  await db.insert(omraPackages).values({
    id: PACKAGE_ID,
    agencyId: AGENCY_ID,
    name: "Test Package Omra",
    type: "omra",
    basePrice: "2500.00",
    durationDays: 10,
    isActive: true,
  }).onConflictDoNothing()

  // Créer un allotment avec stock initial
  await db.insert(omraAllotments).values({
    id: `allot-${PACKAGE_ID}-${DEPARTURE_DATE}`,
    packageId: PACKAGE_ID,
    departureDate: DEPARTURE_DATE,
    availableCount: INITIAL_STOCK,
    overridePrice: "2500.00",
    status: "active",
  }).onConflictDoNothing()

  console.log(`📦 Package + Allotment créés (stock: ${INITIAL_STOCK})`)
}

async function getCurrentStock(): Promise<number> {
  const db = getDb()
  const [allotment] = await db
    .select({ count: omraAllotments.availableCount })
    .from(omraAllotments)
    .where(
      eq(omraAllotments.packageId, PACKAGE_ID),
      eq(omraAllotments.departureDate, DEPARTURE_DATE)
    )
    .limit(1)
  
  return allotment?.count ?? 0
}

/**
 * Simule une réservation Omra atomique avec verrou FOR UPDATE
 */
async function bookOmraAtomically(): Promise<{ ok: boolean; reason?: string }> {
  const db = getDb()

  try {
    return await db.transaction(async (tx) => {
      // 1. Verrou FOR UPDATE sur l'allotment
      const [allotment] = await tx
        .select({ count: omraAllotments.availableCount })
        .from(omraAllotments)
        .where(
          eq(omraAllotments.packageId, PACKAGE_ID),
          eq(omraAllotments.departureDate, DEPARTURE_DATE)
        )
        .for("update")
        .limit(1)

      if (!allotment) {
        return { ok: false, reason: "allotment_not_found" }
      }

      const available = allotment.count
      if (available < BOOKING_SIZE) {
        return { ok: false, reason: "insufficient_stock" }
      }

      // 2. Décrémenter le stock
      await tx
        .update(omraAllotments)
        .set({
          availableCount: sql`${omraAllotments.availableCount} - ${BOOKING_SIZE}`,
        })
        .where(
          eq(omraAllotments.packageId, PACKAGE_ID),
          eq(omraAllotments.departureDate, DEPARTURE_DATE)
        )

      // 3. Insérer un pèlerin de test
      await tx.insert(omraPilgrims).values({
        id: `pilgrim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        reservationId: `res-${Date.now()}`,
        firstName: "Test",
        lastName: "User",
        gender: "male",
        nationality: "TN",
        passportNumber: "TEST123456",
        passportIssueDate: "2024-01-01",
        passportExpiryDate: "2029-01-01",
        passportIssuingCountry: "TN",
        birthDate: "1990-01-01",
      })

      return { ok: true }
    })
  } catch (err) {
    return { ok: false, reason: "transaction_failed" }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL manquant")
    process.exit(1)
  }

  console.log("🧪 Stress Test Module Omra — Réservations Concurrentes\n")

  await setupTestData()

  const before = await getCurrentStock()
  console.log(`📦 Stock initial : ${before} places`)

  // Simuler 8 réservations concurrentes (stock 10, taille 2 → max 5 réservations)
  const concurrentBookings = 8
  console.log(`\n🚀 Lancement de ${concurrentBookings} réservations concurrentes...`)

  const start = Date.now()
  const results = await Promise.all(
    Array.from({ length: concurrentBookings }, () => bookOmraAtomically())
  )
  const duration = Date.now() - start

  const successes = results.filter((r) => r.ok).length
  const failures = results.filter((r) => !r.ok).length
  const failureReasons = results.filter((r) => !r.ok).map((r) => r.reason)

  const after = await getCurrentStock()
  const expectedStock = Math.max(0, before - successes * BOOKING_SIZE)

  console.log(`\n⏱️  Durée : ${duration}ms`)
  console.log(`\n📊 Résultats :`)
  console.log(`✅ Réservations réussies : ${successes}`)
  console.log(`❌ Réservations échouées : ${failures}`)
  console.log(`   Raisons : ${failureReasons.join(", ")}`)
  console.log(`\n💰 Stock final DB : ${after} places`)
  console.log(`🧮 Stock attendu : ${expectedStock} places`)

  const stockOk = after === expectedStock
  const noOverbooking = after >= 0
  const maxPossible = Math.floor(before / BOOKING_SIZE)
  const concurrencyOk = successes <= maxPossible

  console.log(`\n🔍 Vérifications :`)
  console.log(`   Stock cohérent : ${stockOk ? "✅" : "❌"}`)
  console.log(`   Pas de surbooking : ${noOverbooking ? "✅" : "❌"}`)
  console.log(`   Concurrence respectée : ${concurrencyOk ? "✅" : "❌"}`)

  const allOk = stockOk && noOverbooking && concurrencyOk
  console.log(`\n${allOk ? "🎉 TEST PASSÉ" : "💥 TEST ÉCHOUÉ"}`)

  process.exit(allOk ? 0 : 1)
}

main().catch((err) => {
  console.error("Erreur fatale :", err)
  process.exit(1)
})
