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
}
