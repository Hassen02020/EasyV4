/**
 * Script de stress test — Génère 150 agences et 200 réservations
 *
 * Usage: pnpm tsx scripts/stress-test.ts
 */

import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, "..", ".env.local") })

import { getDb, closeDb } from "@/lib/db/client"
import {
  agencies,
  users,
  customers,
  reservations,
  reservationHotel,
  reservationFlight,
  reservationPackage,
  reservationTransfer,
  reservationOmra,
  payments,
  walletTransactions,
} from "@/lib/db/schema"
import { userRole, agencyType, reservationStatus, paymentStatus, paymentMethod, walletTxType, walletTxStatus } from "@/lib/db/schema"
import { randomInt } from "crypto"
import type { reservationModule } from "@/lib/db/schema"

// -------------------------------------------------------------------
// Générateurs de données aléatoires
// -------------------------------------------------------------------

const AGENCY_NAMES = [
  "Tunisie Voyages", "Atlas Travel", "Carthage Tours", "Sahara Explorer",
  "Mediterranean Holidays", "North Africa Travel", "Djerba Dreams",
  "Hammamet Holidays", "Sousse Sun", "Monastir Magic", "Gabes Gateway",
  "Bizerte Beach", "Kairouan Knights", "Tozeur Treasures", "Tataouine Tours",
  "El Jem Excursions", "Kerkennah Keys", "Mahdia Moments", "Nabeul Nature",
  "Zarzis Zen", "Sfax Spirit", "Gafsa Gateway", "Kasserine Comfort",
  "Jendouba Journeys", "Le Kef Legends", "Siliana Springs", "Béja Breaks",
  "Ariana Adventures", "Ben Arous Bliss", "Manouba Memories", "Tunis Travels",
]

const CUSTOMER_NAMES = [
  "Ahmed Ben Ali", "Fatma Trabelsi", "Mohamed Bouazizi", "Amira Kaddour",
  "Youssef Haddad", "Leila Masmoudi", "Karim Ben Salem", "Samia Gharbi",
  "Omar Jaziri", "Nadia Bouchoucha", "Rami Tounsi", "Hela Ayari",
  "Walid Ben Yahia", "Ines Driss", "Maher Mekki", "Rim Sassi",
  "Nabil Chahed", "Sana Gueddana", "Hamdi Zouari", "Kaouther Belaid",
]

const HOTEL_NAMES = [
  "Marhaba Beach", "Hasdrubal Thalassa", "Vincci Marillia", "Sentido Djerba Beach",
  "Radisson Blu Resort", "El Mouradi Hammamet", "Iberostar Averroes", "Royal Thalassa Monastir",
  "Sheraton Sousse", "Mövenpick Resort", "Concorde Green Park", "El Mouradi Mahdia",
  "Ramada Plaza", "Azur Beach", "Palmyra Beach", "Ksar Hammamet",
]

const CITIES = ["Tunis", "Hammamet", "Sousse", "Djerba", "Monastir", "Mahdia", "Nabeul", "Tozeur"]

const MODULES: ("hotel" | "flight" | "package" | "transfer" | "omra")[] = ["hotel", "flight", "package", "transfer", "omra"]

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomEmail(name: string): string {
  const domains = ["gmail.com", "yahoo.fr", "hotmail.com", "outlook.com", "example.tn"]
  const cleanName = name.toLowerCase().replace(/\s+/g, ".")
  return `${cleanName}.${randomInt(100, 999)}@${randomChoice(domains)}`
}

function randomPhone(): string {
  return `+216 ${randomInt(20, 80)} ${randomInt(100, 999)} ${randomInt(100, 999)}`
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function generateId(): string {
  return `${randomInt(100000, 999999)}-${randomInt(1000, 9999)}`
}

function randomAmount(min: number, max: number): number {
  return Number((Math.random() * (max - min) + min).toFixed(2))
}

// -------------------------------------------------------------------
// Génération des agences
// -------------------------------------------------------------------

async function generateAgencies(count: number) {
  console.log(`🏢 Génération de ${count} agences...`)
  const db = getDb()
  const agencyData: any[] = []

  for (let i = 0; i < count; i++) {
    const name = `${AGENCY_NAMES[i % AGENCY_NAMES.length]} ${i + 1}`
    const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
    const agencyId = generateId()

    agencyData.push({
      id: agencyId,
      slug: `${slug}-${i}`,
      name,
      brandName: name,
      contactEmail: randomEmail(name),
      contactPhone: randomPhone(),
      agencyType: "partner" as const,
      matriculeFiscale: `${randomInt(1000000, 9999999)}/A/M/${randomInt(0, 9)}/${String(randomInt(0, 999)).padStart(3, "0")}`,
      registreCommerce: `RC${randomInt(100000, 999999)}`,
      address: `${randomInt(1, 999)} Rue de ${randomChoice(["Tunisie", "Indépendance", "Habib Bourguiba", "Avenue"])}, ${randomChoice(CITIES)}`,
      defaultLanguage: randomChoice(["fr", "en", "ar"]),
      defaultCurrency: randomChoice(["TND", "EUR", "USD"]),
      maskCredit: false,
    })
  }

  await db.insert(agencies).values(agencyData)
  console.log(`✅ ${count} agences créées`)
  return agencyData
}

// -------------------------------------------------------------------
// Génération des utilisateurs
// -------------------------------------------------------------------

async function generateUsers(agencyData: any[]) {
  console.log(`👤 Génération des utilisateurs...`)
  const db = getDb()
  const userData: any[] = []

  for (const agency of agencyData) {
    const userId = generateId()
    userData.push({
      id: userId,
      agencyId: agency.id,
      email: randomEmail(agency.name),
      name: `Admin ${agency.name}`,
      role: "partner_owner" as const,
      status: "active" as const,
      twoFactorEnabled: false,
    })
  }

  await db.insert(users).values(userData)
  console.log(`✅ ${userData.length} utilisateurs créés`)
  return userData
}

// -------------------------------------------------------------------
// Génération des clients
// -------------------------------------------------------------------

async function generateCustomers(agencyData: any[], count: number) {
  console.log(`👥 Génération de ${count} clients...`)
  const db = getDb()
  const customerData: any[] = []

  for (let i = 0; i < count; i++) {
    const agency = randomChoice(agencyData)
    const name = CUSTOMER_NAMES[i % CUSTOMER_NAMES.length]
    const [firstName, lastName] = name.split(" ")

    customerData.push({
      id: generateId(),
      agencyId: agency.id,
      authUserId: null,
      civility: randomChoice(["M", "Mme", "Mlle"]),
      firstName,
      lastName,
      email: randomEmail(name),
      phone: randomPhone(),
      civicId: `${randomInt(10000000, 99999999)}`,
      civicIdType: "cin",
      birthDate: randomDate(new Date(1960, 0, 1), new Date(2000, 0, 1)),
      nationality: "Tunisienne",
      country: "Tunisie",
      city: randomChoice(CITIES),
      language: "fr",
    })
  }

  await db.insert(customers).values(customerData)
  console.log(`✅ ${count} clients créés`)
  return customerData
}

// -------------------------------------------------------------------
// Génération des réservations
// -------------------------------------------------------------------

async function generateReservations(
  agencyData: any[],
  customerData: any[],
  count: number
) {
  console.log(`📋 Génération de ${count} réservations...`)
  const db = getDb()
  const reservationData: any[] = []
  const reservationExtensions: any = {
    hotel: [],
    flight: [],
    package: [],
    transfer: [],
    omra: [],
  }

  for (let i = 0; i < count; i++) {
    const agency = randomChoice(agencyData)
    const customer = randomChoice(customerData)
    const module = randomChoice(MODULES)
    const status = randomChoice(["confirmed", "pending", "cancelled"] as const)
    const checkIn = randomDate(new Date(2024, 0, 1), new Date(2025, 11, 31))
    const checkOut = new Date(checkIn.getTime() + randomInt(1, 14) * 24 * 60 * 60 * 1000)
    const totalAmount = randomAmount(500, 5000)

    const reservationId = generateId()
    const publicRef = `E2B-${randomInt(100000, 999999)}`

    reservationData.push({
      id: reservationId,
      publicRef,
      agencyId: agency.id!,
      customerId: customer.id!,
      module,
      status,
      source: "internal" as const,
      originalCurrency: agency.defaultCurrency,
      originalAmount: totalAmount,
      tndAmount: totalAmount,
      checkIn,
      checkOut,
      adults: randomInt(1, 4),
      children: randomInt(0, 3),
      notes: `Réservation de test ${i + 1}`,
      createdAt: randomDate(new Date(2024, 0, 1), new Date()),
    })

    switch (module) {
      case "hotel":
        reservationExtensions.hotel.push({
          id: generateId(),
          reservationId,
          hotelName: randomChoice(HOTEL_NAMES),
          city: randomChoice(CITIES),
          stars: randomInt(3, 5),
          boardBasis: randomChoice(["bb", "hb", "fb", "ai"]),
          roomType: randomChoice(["single", "double", "triple", "suite"]),
        })
        break
      case "flight":
        reservationExtensions.flight.push({
          id: generateId(),
          reservationId,
          airline: randomChoice(["Tunisair", "Air France", "Lufthansa", "Turkish Airlines"]),
          flightNumber: `TU${randomInt(100, 999)}`,
          departureAirport: "TUN",
          arrivalAirport: randomChoice(["CDG", "LHR", "FRA", "IST", "DXB"]),
          departureTime: checkIn,
          arrivalTime: new Date(checkIn.getTime() + randomInt(2, 5) * 60 * 60 * 1000),
        })
        break
      case "package":
        reservationExtensions.package.push({
          id: generateId(),
          reservationId,
          packageName: randomChoice(["Tunisie Discovery", "Sahara Adventure", "Coastal Paradise"]),
          duration: randomInt(3, 10),
          includes: randomChoice(["flight", "hotel", "both"]),
        })
        break
      case "transfer":
        reservationExtensions.transfer.push({
          id: generateId(),
          reservationId,
          fromAirport: randomChoice(["TUN", "MIR", "DJE"]),
          toHotel: randomChoice(HOTEL_NAMES),
          vehicleType: randomChoice(["sedan", "van", "minibus"]),
        })
        break
      case "omra":
        reservationExtensions.omra.push({
          id: generateId(),
          reservationId,
          packageType: randomChoice(["economy", "standard", "vip"]),
          departureDate: checkIn,
          returnDate: checkOut,
          visaIncluded: Math.random() > 0.5,
        })
        break
    }
  }

  await db.insert(reservations).values(reservationData)

  if (reservationExtensions.hotel.length > 0) {
    await db.insert(reservationHotel).values(reservationExtensions.hotel)
  }
  if (reservationExtensions.flight.length > 0) {
    await db.insert(reservationFlight).values(reservationExtensions.flight)
  }
  if (reservationExtensions.package.length > 0) {
    await db.insert(reservationPackage).values(reservationExtensions.package)
  }
  if (reservationExtensions.transfer.length > 0) {
    await db.insert(reservationTransfer).values(reservationExtensions.transfer)
  }
  if (reservationExtensions.omra.length > 0) {
    await db.insert(reservationOmra).values(reservationExtensions.omra)
  }

  console.log(`✅ ${count} réservations créées`)
  return reservationData
}

// -------------------------------------------------------------------
// Génération des paiements
// -------------------------------------------------------------------

async function generatePayments(reservationData: any[]) {
  console.log(`💳 Génération des paiements...`)
  const db = getDb()
  const paymentData: any[] = []

  for (const reservation of reservationData) {
    if (reservation.status === "cancelled") continue

    const paymentCount = randomInt(1, 2)
    for (let i = 0; i < paymentCount; i++) {
      const amount = Number(reservation.tndAmount) / paymentCount
      paymentData.push({
        id: generateId(),
        reservationId: reservation.id,
        agencyId: reservation.agencyId,
        amount,
        currency: reservation.originalCurrency,
        status: randomChoice(["captured", "pending"] as const),
        method: randomChoice(["transfer", "card", "cash"] as const),
        psp: "manual" as const,
        createdAt: randomDate(reservation.createdAt, new Date()),
      })
    }
  }

  await db.insert(payments).values(paymentData)
  console.log(`✅ ${paymentData.length} paiements créés`)
}

// -------------------------------------------------------------------
// Génération des crédits wallet
// -------------------------------------------------------------------

async function generateWalletCredits(agencyData: any[]) {
  console.log(`💰 Génération des crédits wallet...`)
  const db = getDb()
  const creditData: any[] = []

  for (const agency of agencyData) {
    const creditCount = randomInt(1, 5)
    for (let i = 0; i < creditCount; i++) {
      const amount = randomAmount(1000, 10000)
      creditData.push({
        id: generateId(),
        agencyId: agency.id,
        amount,
        type: randomChoice(["credit", "debit"] as const),
        description: randomChoice(["Recharge initiale", "Recharge mensuelle", "Ajustement"]),
        createdAt: randomDate(new Date(2024, 0, 1), new Date()),
      })
    }
  }

  await db.insert(walletTransactions).values(creditData)
  console.log(`✅ ${creditData.length} crédits wallet créés`)
}

// -------------------------------------------------------------------
// Main
// -------------------------------------------------------------------

async function main() {
  console.log("🚀 Démarrage du stress test...\n")

  try {
    const agencyData = await generateAgencies(150)
    await generateUsers(agencyData)
    const customerData = await generateCustomers(agencyData, 300)
    const reservationData = await generateReservations(agencyData, customerData, 200)
    await generatePayments(reservationData)
    await generateWalletCredits(agencyData)

    await closeDb()

    console.log("\n✅ Stress test terminé avec succès !")
    console.log(`📊 Résumé :`)
    console.log(`   - 150 agences`)
    console.log(`   - 150 utilisateurs`)
    console.log(`   - 300 clients`)
    console.log(`   - 200 réservations (multi-modules)`)
    console.log(`   - Paiements générés`)
    console.log(`   - Crédits wallet générés`)
  } catch (error) {
    console.error("❌ Erreur lors du stress test :", error)
    await closeDb()
    process.exit(1)
  }
}

main()
