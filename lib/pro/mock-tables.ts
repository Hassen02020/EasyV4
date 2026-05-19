/**
 * Mocks structurés pour les Data Tables du portail B2B (Phase 7).
 *
 * Données déterministes (seedées sur l'index) afin que les pages soient
 * reproductibles entre rendus. Volume volontairement modéré (15-25 lignes)
 * pour rester lisible sans pagination — la pagination sera ajoutée en
 * phase 7+ une fois la couche Supabase branchée.
 */

import { addDays, format } from "date-fns"

const TODAY = new Date("2026-05-13T00:00:00.000Z")

export type PartnerReservation = {
  id: string
  ref: string
  clientName: string
  service: string
  hotelName: string
  module: "hotel" | "flight" | "omra" | "package" | "activity" | "transfer"
  checkin: string
  checkout: string
  status: "pending" | "on_option" | "confirmed" | "cancelled" | "completed"
  optionExpiresAt: string | null
  totalTnd: number
  createdAt: string
}

const FIRST_NAMES = [
  "Mohamed",
  "Fatma",
  "Karim",
  "Leila",
  "Ahmed",
  "Sami",
  "Yasmine",
  "Mehdi",
  "Sarra",
  "Omar",
]
const LAST_NAMES = [
  "Ben Salah",
  "Karoui",
  "Trabelsi",
  "Mansour",
  "Belhadj",
  "Saidi",
  "Khelifi",
  "Ferchichi",
  "Mejri",
  "Bouazizi",
]

const SERVICES = [
  "Séjour Hammamet 4N - Mouradi Palace",
  "Séjour Djerba 7N - Iberostar Mehari",
  "Séjour Sousse 5N - Mövenpick",
  "Voyage Tozeur 3N - Anantara Sahara",
  "Activité Sahara Douz 1 journée",
  "Vol Tunis ↔ Paris (aller-retour)",
  "Transfert aéroport Tunis-Carthage",
  "Omra 12 jours - Vol + hôtel",
  "Séjour Tabarka 4N - Iberostar Mehari",
]

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]!
}

export function generateMockReservations(): PartnerReservation[] {
  return Array.from({ length: 24 }, (_, i) => {
    const seed = i * 7 + 3
    const statuses: PartnerReservation["status"][] = [
      "confirmed",
      "pending",
      "on_option",
      "confirmed",
      "cancelled",
      "completed",
    ]
    const modules: PartnerReservation["module"][] = [
      "hotel",
      "hotel",
      "hotel",
      "package",
      "activity",
      "flight",
      "omra",
      "transfer",
    ]
    const checkinOffset = (seed % 90) - 30
    const checkin = addDays(TODAY, checkinOffset)
    const duration = 3 + (seed % 7)
    const checkout = addDays(checkin, duration)
    const status = pick(statuses, seed)
    const optionExpiresAt =
      status === "on_option"
        ? format(addDays(TODAY, seed % 5), "yyyy-MM-dd")
        : null

    return {
      id: `res-${i + 1}`,
      ref: `B2B-2026-${String(1024 + i).padStart(5, "0")}`,
      clientName: `${pick(FIRST_NAMES, seed)} ${pick(LAST_NAMES, seed + 3)}`,
      service: pick(SERVICES, seed),
      hotelName: pick(SERVICES, seed).replace(/.*- /, ""),
      module: pick(modules, seed),
      checkin: format(checkin, "yyyy-MM-dd"),
      checkout: format(checkout, "yyyy-MM-dd"),
      status,
      optionExpiresAt,
      totalTnd: 350 + ((seed * 137) % 2200),
      createdAt: format(addDays(TODAY, -((seed * 3) % 60)), "yyyy-MM-dd"),
    }
  })
}

export type PartnerClient = {
  id: string
  name: string
  phone: string
  email: string
  bookings: number
  createdAt: string
}

export function generateMockClients(): PartnerClient[] {
  return Array.from({ length: 18 }, (_, i) => {
    const seed = i * 11 + 5
    const first = pick(FIRST_NAMES, seed)
    const last = pick(LAST_NAMES, seed + 7)
    return {
      id: `cli-${i + 1}`,
      name: `${first} ${last}`,
      phone: `+216 ${20 + (seed % 80)} ${100 + (seed % 800)} ${100 + ((seed * 7) % 900)}`,
      email:
        `${first}.${last.toLowerCase().replace(/ /g, "")}@example.tn`.toLowerCase(),
      bookings: 1 + (seed % 6),
      createdAt: format(addDays(TODAY, -((seed * 4) % 365)), "yyyy-MM-dd"),
    }
  })
}

export type PartnerPayment = {
  id: string
  date: string
  mode: "transfer" | "card" | "cash" | "credit_account" | "check"
  dueDate: string
  emissionDate: string
  originalAmount: number
  remainingAmount: number
  credit: number
  invoiceRef: string | null
}

export function generateMockPayments(): PartnerPayment[] {
  const modes: PartnerPayment["mode"][] = [
    "transfer",
    "card",
    "credit_account",
    "transfer",
    "check",
    "cash",
  ]
  return Array.from({ length: 16 }, (_, i) => {
    const seed = i * 13 + 7
    const originalAmount = 500 + ((seed * 89) % 4500)
    const remainingAmount = seed % 3 === 0 ? originalAmount * 0.4 : 0
    return {
      id: `pmt-${i + 1}`,
      date: format(addDays(TODAY, -((seed * 3) % 180)), "yyyy-MM-dd"),
      mode: pick(modes, seed),
      dueDate: format(addDays(TODAY, ((seed * 5) % 45) - 15), "yyyy-MM-dd"),
      emissionDate: format(addDays(TODAY, -((seed * 2) % 90)), "yyyy-MM-dd"),
      originalAmount,
      remainingAmount,
      credit: seed % 5 === 0 ? originalAmount : 0,
      invoiceRef:
        seed % 4 === 0 ? null : `FA-2026-${String(2048 + i).padStart(5, "0")}`,
    }
  })
}

export type PartnerInvoice = {
  id: string
  ref: string
  type: "facture" | "avoir" | "proforma"
  validatedAt: string
  totalHT: number
  totalTVA: number
  totalSales: number
  paidAmount: number
  status: "paid" | "partial" | "unpaid"
}

export function generateMockInvoices(): PartnerInvoice[] {
  const types: PartnerInvoice["type"][] = [
    "facture",
    "facture",
    "facture",
    "avoir",
    "proforma",
  ]
  return Array.from({ length: 20 }, (_, i) => {
    const seed = i * 17 + 11
    const totalSales = 600 + ((seed * 79) % 4800)
    const tva = Math.round(totalSales * 0.19 * 100) / 100
    const paid =
      seed % 3 === 0 ? totalSales * 0.5 : seed % 4 === 0 ? 0 : totalSales
    const status: PartnerInvoice["status"] =
      paid >= totalSales ? "paid" : paid > 0 ? "partial" : "unpaid"
    const type = pick(types, seed)
    const prefix = type === "facture" ? "FA" : type === "avoir" ? "AV" : "PF"
    return {
      id: `inv-${i + 1}`,
      ref: `${prefix}-2026-${String(2048 + i).padStart(5, "0")}`,
      type,
      validatedAt: format(addDays(TODAY, -((seed * 4) % 180)), "yyyy-MM-dd"),
      totalHT: Math.round((totalSales - tva) * 100) / 100,
      totalTVA: tva,
      totalSales,
      paidAmount: Math.round(paid * 100) / 100,
      status,
    }
  })
}

export type PartnerLedgerEntry = {
  id: string
  date: string
  ref: string
  description: string
  type: "facture" | "avoir" | "payment" | "credit"
  debit: number
  credit: number
}

export function generateMockLedger(): PartnerLedgerEntry[] {
  let counter = 0
  const entries: PartnerLedgerEntry[] = []
  for (let i = 0; i < 30; i++) {
    counter += 1
    const seed = i * 19 + 13
    const amount = 300 + ((seed * 41) % 3500)
    const isCredit = seed % 4 === 0
    entries.push({
      id: `led-${counter}`,
      date: format(addDays(TODAY, -((seed * 5) % 220)), "yyyy-MM-dd"),
      ref: `${isCredit ? "PAY" : "FA"}-2026-${String(3000 + counter).padStart(5, "0")}`,
      description: isCredit ? "Règlement client / dépôt" : pick(SERVICES, seed),
      type: isCredit ? "payment" : seed % 5 === 0 ? "avoir" : "facture",
      debit: isCredit ? 0 : amount,
      credit: isCredit ? amount : 0,
    })
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date))
}
