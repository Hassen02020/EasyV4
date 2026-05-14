/**
 * Seed mock data réaliste dans Supabase pour démontrer la PR 2/3.
 *
 * - 1 agence TunisiaGo (déjà seedée)
 * - 60 customers
 * - 250 reservations (90 derniers jours, mix de modules, mix statuts)
 * - 1 reservation extension par module pour les 250
 * - ~180 payments (1 par résa hors pending/cancelled)
 * - 12 audit_events api_error (24 dernières heures, pour le widget dashboard)
 * - 200 audit_events misc (90 derniers jours)
 *
 * Usage : `pnpm tsx scripts/seed-mock-data.ts` (dotenv chargé automatiquement
 * via `dotenv -e .env.local` côté script).
 *
 * Idempotent : nettoie d'abord toutes les tables non-référentielles de l'agence
 * `00000000-0000-0000-0000-000000000001`, puis réinjecte.
 */

import "dotenv/config"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import {
  customers,
  reservations,
  reservationHotel,
  reservationFlight,
  reservationOmra,
  reservationActivity,
  reservationTransfer,
  reservationPackage,
  payments,
  auditEvents,
  currencies,
} from "@/lib/db/schema"

const AGENCY_ID = "00000000-0000-0000-0000-000000000001"

const FR_FIRST_NAMES = [
  "Mehdi",
  "Sami",
  "Yasmine",
  "Salma",
  "Khaled",
  "Mohamed",
  "Aïcha",
  "Fatma",
  "Imen",
  "Hichem",
  "Nour",
  "Anis",
  "Maryam",
  "Rania",
  "Youssef",
  "Karim",
  "Nadia",
  "Sara",
  "Bilel",
  "Hela",
  "Sonia",
  "Marwa",
  "Wassim",
  "Hatem",
  "Lina",
  "Hamza",
  "Rim",
  "Slim",
  "Olfa",
  "Mariem",
]

const FR_LAST_NAMES = [
  "Ben Salah",
  "Trabelsi",
  "Belhadj",
  "Bouazizi",
  "Mejri",
  "Khelifi",
  "Hamdi",
  "Saidi",
  "Jelassi",
  "Ferchichi",
  "Gharbi",
  "Karoui",
  "Sassi",
  "Romdhane",
  "Cherni",
  "Bouslama",
  "Naïli",
  "Aouadi",
  "Belkahla",
  "Mahjoub",
  "Dridi",
  "Zouari",
  "Slim",
  "Tlili",
  "Chouchane",
  "Ouali",
  "Hannachi",
  "Sebai",
  "Ferjani",
  "Tarhouni",
]

const CITIES = [
  "Tunis",
  "Sfax",
  "Sousse",
  "Monastir",
  "Bizerte",
  "Nabeul",
  "Kairouan",
  "Gabès",
  "Hammamet",
  "Djerba",
]

const MODULES = [
  "hotel",
  "flight",
  "package",
  "omra",
  "transfer",
  "activity",
] as const

const SOURCES = ["mygo", "internal", "amadeus", "manual"] as const

const STATUSES = [
  "pending",
  "confirmed",
  "confirmed",
  "confirmed",
  "completed",
  "completed",
  "cancelled",
  "on_request",
] as const

const CURRENCIES = ["TND", "EUR", "USD"] as const
const CURRENCY_TO_TND: Record<string, number> = {
  TND: 1,
  EUR: 3.4,
  USD: 3.1,
}

const HOTELS = [
  { id: 101, name: "Hôtel Yadis Djerba Golf", city: "Djerba", cityId: 1 },
  {
    id: 102,
    name: "Iberostar Selection Diar El Andalous",
    city: "Sousse",
    cityId: 2,
  },
  { id: 103, name: "Hasdrubal Thalassa & Spa", city: "Hammamet", cityId: 3 },
  { id: 104, name: "Royal Azur Thalassa", city: "Hammamet", cityId: 3 },
  { id: 105, name: "Concorde Marco Polo", city: "Hammamet", cityId: 3 },
  { id: 106, name: "Vincci Lella Baya", city: "Hammamet", cityId: 3 },
  { id: 107, name: "Iberostar Mehari Djerba", city: "Djerba", cityId: 1 },
  { id: 108, name: "El Mouradi Palm Marina", city: "Sousse", cityId: 2 },
]

const FLIGHT_PAIRS = [
  ["TUN", "PAR"],
  ["TUN", "MRS"],
  ["TUN", "LYS"],
  ["TUN", "CDG"],
  ["TUN", "DXB"],
  ["TUN", "IST"],
  ["DJE", "PAR"],
  ["MIR", "FRA"],
]

const OMRA_PROGRAMS = [
  "Omra Famille Standard 12J",
  "Omra Premium Mecque-Médine 15J",
  "Omra Ramadan 21J VIP",
  "Omra Express 7J",
]

const _ACTIVITIES = [
  "Excursion Sahara 4x4 (Douz)",
  "Médina de Tunis guidée",
  "Plongée à Tabarka",
  "Carthage + Sidi Bou Saïd",
  "Quad dunes Djerba",
]

const TRANSFER_TYPES = ["sedan", "van", "minibus", "luxury"] as const

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3600 * 1000)
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }
  console.log(
    "[seed] DATABASE_URL =",
    process.env.DATABASE_URL.replace(/:[^:@]+@/, ":<REDACTED>@"),
  )

  const db = getDb()

  console.log("[seed] cleaning agency data...")
  await db.delete(payments).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(reservationHotel).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(reservationFlight).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(reservationOmra).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(reservationActivity).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(reservationTransfer).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(reservationPackage).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(reservations).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(auditEvents).where(sql`agency_id = ${AGENCY_ID}`)
  await db.delete(customers).where(sql`agency_id = ${AGENCY_ID}`)

  console.log("[seed] ensuring currencies (TND, EUR, USD)...")
  await db
    .insert(currencies)
    .values([
      { code: "TND", symbol: "د.ت", name: "Dinar tunisien", decimals: 3 },
      { code: "EUR", symbol: "€", name: "Euro", decimals: 2 },
      { code: "USD", symbol: "$", name: "Dollar US", decimals: 2 },
    ])
    .onConflictDoNothing()

  console.log("[seed] inserting 60 customers...")
  const customerRows: { id: string }[] = []
  for (let i = 0; i < 60; i++) {
    const firstName = rand(FR_FIRST_NAMES)
    const lastName = rand(FR_LAST_NAMES)
    const city = rand(CITIES)
    const inserted = await db
      .insert(customers)
      .values({
        agencyId: AGENCY_ID,
        firstName,
        lastName,
        email: `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, "")}${i}@example.tn`,
        phone: `+216 ${randInt(20, 99)} ${randInt(100, 999)} ${randInt(100, 999)}`,
        civility: Math.random() > 0.5 ? "M" : "Mme",
        civicId: `${randInt(10000000, 14999999)}`,
        civicIdType: "cin",
        nationality: "TN",
        country: "Tunisie",
        city,
        language: "fr",
        createdAt: daysAgo(randInt(0, 120)),
      })
      .returning({ id: customers.id })
    customerRows.push(inserted[0]!)
  }

  console.log("[seed] inserting 250 reservations + extensions...")
  let publicRefSeq = 1000
  for (let i = 0; i < 250; i++) {
    const mod = rand(MODULES)
    const customer = rand(customerRows)
    const status = rand(STATUSES)
    const createdDaysAgo = randInt(0, 90)
    const createdAt = daysAgo(createdDaysAgo)
    const currency = rand(CURRENCIES)
    const baseAmount = randInt(150, 4500)
    const tndAmount = (baseAmount * CURRENCY_TO_TND[currency]!).toFixed(2)
    const originalAmount = baseAmount.toFixed(2)
    const publicRef = `TG-2026-${String(publicRefSeq++).padStart(6, "0")}`

    const [{ id: resId }] = await db
      .insert(reservations)
      .values({
        agencyId: AGENCY_ID,
        publicRef,
        customerId: customer.id,
        module: mod,
        source: rand(SOURCES),
        status,
        originalCurrency: currency,
        originalAmount,
        tndAmount,
        depositAmount: (Number(originalAmount) * 0.3).toFixed(2),
        depositPaid:
          status === "pending"
            ? "0"
            : (Number(originalAmount) * 0.3).toFixed(2),
        createdAt,
        updatedAt: createdAt,
        cancelledAt: status === "cancelled" ? createdAt : null,
      })
      .returning({ id: reservations.id })

    if (mod === "hotel") {
      const hotel = rand(HOTELS)
      const checkInDays = randInt(7, 60)
      const nights = randInt(2, 14)
      await db.insert(reservationHotel).values({
        reservationId: resId,
        agencyId: AGENCY_ID,
        hotelId: hotel.id,
        hotelName: hotel.name,
        cityId: hotel.cityId,
        cityName: hotel.city,
        checkIn: daysAgo(-checkInDays).toISOString().slice(0, 10),
        checkOut: daysAgo(-(checkInDays + nights))
          .toISOString()
          .slice(0, 10),
        nights,
        adults: randInt(1, 4),
        childrenAges: Math.random() > 0.6 ? [randInt(2, 12)] : null,
        boardCode: rand(["RO", "BB", "HB", "FB", "AI"]),
        boardName: rand([
          "Logement seul",
          "Petit-déjeuner",
          "Demi-pension",
          "Pension complète",
          "All Inclusive",
        ]),
      })
    } else if (mod === "flight") {
      const pair = rand(FLIGHT_PAIRS)
      await db.insert(reservationFlight).values({
        reservationId: resId,
        agencyId: AGENCY_ID,
        pnr: `PNR${randInt(100000, 999999)}`,
        origin: pair[0]!,
        destination: pair[1]!,
        departAt: daysAgo(-randInt(7, 90)),
        arriveAt: daysAgo(-randInt(7, 90)),
        cabinClass: rand(["economy", "economy", "business"]),
        adults: randInt(1, 4),
        children: randInt(0, 2),
        infants: 0,
      })
    } else if (mod === "omra") {
      const depDays = randInt(30, 180)
      await db.insert(reservationOmra).values({
        reservationId: resId,
        agencyId: AGENCY_ID,
        omraPackageId: crypto.randomUUID(),
        departureDate: daysAgo(-depDays).toISOString().slice(0, 10),
        returnDate: daysAgo(-(depDays + 12))
          .toISOString()
          .slice(0, 10),
        pilgrims: randInt(1, 6),
        visaStatus: rand(["pending", "submitted", "approved"]),
        travelers: { programName: rand(OMRA_PROGRAMS) },
      })
    } else if (mod === "activity") {
      await db.insert(reservationActivity).values({
        reservationId: resId,
        agencyId: AGENCY_ID,
        activityId: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        sessionDate: daysAgo(-randInt(2, 45)).toISOString().slice(0, 10),
        sessionStart: rand(["09:00", "10:30", "14:00", "16:30"]),
        sessionEnd: rand(["12:00", "13:30", "17:00", "19:30"]),
        adults: randInt(1, 6),
        children: randInt(0, 3),
      })
    } else if (mod === "transfer") {
      await db.insert(reservationTransfer).values({
        reservationId: resId,
        agencyId: AGENCY_ID,
        vehicleType: rand(TRANSFER_TYPES),
        pickupAddress: `Aéroport ${rand(["TUN", "DJE", "MIR"])}`,
        dropoffAddress: `Hôtel à ${rand(CITIES)}`,
        flightNumber: `TU${randInt(100, 999)}`,
        flightArrivalAt: daysAgo(-randInt(2, 45)),
        pax: randInt(1, 8),
        luggageCount: randInt(1, 6),
      })
    } else if (mod === "package") {
      const depDays = randInt(15, 90)
      await db.insert(reservationPackage).values({
        reservationId: resId,
        agencyId: AGENCY_ID,
        packageId: crypto.randomUUID(),
        departureId: crypto.randomUUID(),
        departureDate: daysAgo(-depDays).toISOString().slice(0, 10),
        returnDate: daysAgo(-(depDays + randInt(5, 14)))
          .toISOString()
          .slice(0, 10),
        adults: randInt(1, 6),
        travelers: {
          title: `Voyage organisé ${rand(["Istanbul", "Dubaï", "Bali", "Andalousie"])}`,
        },
      })
    }

    // payments: 1 deposit if not pending/cancelled
    if (status !== "pending" && status !== "cancelled") {
      const depAmt = Number(originalAmount) * 0.3
      await db.insert(payments).values({
        agencyId: AGENCY_ID,
        reservationId: resId,
        psp: "sps",
        method: "card",
        kind: "deposit",
        status: "captured",
        originalCurrency: currency,
        originalAmount: depAmt.toFixed(2),
        tndAmount: (depAmt * CURRENCY_TO_TND[currency]!).toFixed(2),
        cardBrand: rand(["visa", "mastercard"]),
        cardLast4: String(randInt(1000, 9999)),
        threeDsOk: true,
        capturedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      })
      // also balance payment for completed
      if (status === "completed") {
        const balAmt = Number(originalAmount) * 0.7
        await db.insert(payments).values({
          agencyId: AGENCY_ID,
          reservationId: resId,
          psp: "sps",
          method: "card",
          kind: "balance",
          status: "captured",
          originalCurrency: currency,
          originalAmount: balAmt.toFixed(2),
          tndAmount: (balAmt * CURRENCY_TO_TND[currency]!).toFixed(2),
          cardBrand: rand(["visa", "mastercard"]),
          cardLast4: String(randInt(1000, 9999)),
          threeDsOk: true,
          capturedAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        })
      }
    }
  }

  console.log("[seed] inserting audit events (api_error + misc)...")
  // 12 api_error in last 24h
  const endpoints = [
    "/api/hotels/search",
    "/api/hotels/details/103",
    "/api/hotels/cities",
    "/api/mygo/list-tag",
  ]
  for (let i = 0; i < 12; i++) {
    await db.insert(auditEvents).values({
      agencyId: AGENCY_ID,
      entityType: "api_error",
      entityId: rand(endpoints),
      action: "request_failed",
      diff: {
        status: rand([502, 503, 504, 429, 500]),
        message: rand([
          "myGo timeout après 5s",
          "myGo 502 Bad Gateway",
          "Token expired",
          "Rate limit hit",
        ]),
      },
      createdAt: hoursAgo(randInt(0, 23)),
    })
  }

  // 80 misc audit (logins + reservation create/update)
  for (let i = 0; i < 80; i++) {
    await db.insert(auditEvents).values({
      agencyId: AGENCY_ID,
      entityType: rand(["reservation", "payment", "customer", "session"]),
      entityId: crypto.randomUUID(),
      action: rand(["create", "update", "cancel", "login", "refund"]),
      diff: { note: "mock event" },
      createdAt: daysAgo(randInt(0, 60)),
    })
  }

  console.log("[seed] ✅ done. Summary :")
  const [c] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(customers)
  const [r] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(reservations)
  const [p] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(payments)
  const [a] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(auditEvents)
  console.log("  customers     :", c?.value)
  console.log("  reservations  :", r?.value)
  console.log("  payments      :", p?.value)
  console.log("  audit_events  :", a?.value)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed] ❌", err)
    process.exit(1)
  })
