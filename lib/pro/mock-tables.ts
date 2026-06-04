/**
 * Types pour les tables mockées du back-office partenaire
 */

export type PartnerReservation = {
  id: string
  reference: string
  customerName: string
  module: string
  status: "pending" | "confirmed" | "cancelled" | "refunded"
  amount: number
  createdAt: string
}

export type PartnerInvoice = {
  id: string
  number: string
  date: string
  amount: number
  status: "paid" | "pending" | "overdue"
  type: "facture" | "avoir" | "proforma"
}

export type PartnerPayment = {
  id: string
  date: string
  amount: number
  method: string
  reference?: string
}

export type PartnerLedgerEntry = {
  id: string
  date: string
  description: string
  debit?: number
  credit?: number
  balance: number
}

export type PartnerClient = {
  id: string
  name: string
  email: string
  phone?: string
  reservationsCount: number
  /** Alias de reservationsCount pour compatibilité composants */
  bookings: number
  /** Date du premier dossier */
  createdAt: string
}

// Fonctions mock pour générer des données de test
export function generateMockReservations(count: number = 10): PartnerReservation[] {
  const statuses: PartnerReservation["status"][] = ["pending", "confirmed", "cancelled", "refunded"]
  const modules = ["Hôtel", "Voyage", "Transfert", "Omra"]
  
  return Array.from({ length: count }, (_, i) => ({
    id: `res-${i + 1}`,
    reference: `E2B-${2024}${String(i + 1).padStart(4, "0")}`,
    customerName: `Client ${i + 1}`,
    module: modules[i % modules.length],
    status: statuses[i % statuses.length],
    amount: Math.round(Math.random() * 5000 + 500),
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  }))
}

export function generateMockClients(count: number = 10): PartnerClient[] {
  return Array.from({ length: count }, (_, i) => {
    const reservationsCount = Math.floor(Math.random() * 20)
    return {
      id: `client-${i + 1}`,
      name: `Client Pro ${i + 1}`,
      email: `client${i + 1}@example.com`,
      phone: i % 3 === 0 ? `+216 2${String(i).padStart(7, "0")}` : undefined,
      reservationsCount,
      bookings: reservationsCount,
      createdAt: new Date(Date.now() - i * 30 * 86400000).toISOString().split("T")[0],
    }
  })
}

export function generateMockInvoices(count: number = 10): PartnerInvoice[] {
  const statuses: PartnerInvoice["status"][] = ["paid", "pending", "overdue"]
  const types: PartnerInvoice["type"][] = ["facture", "avoir", "proforma"]
  
  return Array.from({ length: count }, (_, i) => ({
    id: `inv-${i + 1}`,
    number: `F-${2024}-${String(i + 1).padStart(4, "0")}`,
    date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
    amount: Math.round(Math.random() * 3000 + 200),
    status: statuses[i % statuses.length],
    type: types[i % types.length],
  }))
}

export function generateMockPayments(count: number = 10): PartnerPayment[] {
  const methods = ["Virement", "Carte", "Espèces", "Chèque"]
  
  return Array.from({ length: count }, (_, i) => ({
    id: `pay-${i + 1}`,
    date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
    amount: Math.round(Math.random() * 2000 + 100),
    method: methods[i % methods.length],
    reference: i % 2 === 0 ? `REF-${Math.floor(Math.random() * 10000)}` : undefined,
  }))
}

export function generateMockLedger(count: number = 10): PartnerLedgerEntry[] {
  let balance = 0
  
  return Array.from({ length: count }, (_, i) => {
    const debit = i % 3 === 0 ? Math.round(Math.random() * 1000) : undefined
    const credit = i % 3 !== 0 ? Math.round(Math.random() * 1000) : undefined
    
    if (debit) balance -= debit
    if (credit) balance += credit
    
    return {
      id: `ledger-${i + 1}`,
      date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
      description: `Opération ${i + 1}`,
      debit,
      credit,
      balance: Math.round(balance),
    }
  })
}
