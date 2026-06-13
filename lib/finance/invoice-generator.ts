/**
 * Invoice Generator - Easy2Book V6
 *
 * Service de génération de factures PDF
 * Utilise jsPDF pour créer des factures conformes aux normes tunisiennes
 *
 * NOTE: jsPDF doit être installé: npm install jspdf @types/jspdf
 */

// import { jsPDF } from "jspdf"
import type { ReservationFinancial, JournalEntry, JournalLine } from "@/lib/db/schema"

/**
 * Données pour la génération de facture
 */
export interface InvoiceData {
  // Émetteur (Easy2Book / Agence)
  issuer: {
    name: string
    address: string
    phone: string
    email: string
    taxId?: string // Matricule fiscal
    logo?: string // URL ou base64
  }

  // Client
  customer: {
    name: string
    address?: string
    phone?: string
    email?: string
    taxId?: string
  }

  // Facture
  invoice: {
    number: string // FAC-2024-001
    date: Date
    dueDate?: Date
    reference?: string // Réf réservation
    type: "facture" | "avoir" | "proforma"
  }

  // Lignes de facturation
  lines: Array<{
    description: string
    quantity: number
    unitPrice: number
    vatRate: number // Taux TVA en %
    total: number
  }>

  // Totaux
  totals: {
    subtotal: number
    vatAmount: number
    total: number
    paidAmount?: number
    remainingAmount?: number
  }

  // Notes
  notes?: string
  paymentTerms?: string
}

/**
 * Options de génération PDF
 */
export interface InvoiceGeneratorOptions {
  language?: "fr" | "ar" | "en"
  includeVat?: boolean
  includeBarcode?: boolean
  watermark?: string
}

/**
 * Génère une facture PDF
 * NOTE: Nécessite jsPDF installé: npm install jspdf @types/jspdf
 */
export async function generateInvoicePDF(
  data: InvoiceData,
  options: InvoiceGeneratorOptions = {}
): Promise<Blob> {
  // TODO: Implémenter après installation de jsPDF
  throw new Error("jsPDF doit être installé pour générer des PDF")
  
  /*
  const {
    language = "fr",
    includeVat = true,
    includeBarcode = true,
    watermark,
  } = options

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let yPosition = 20

  // En-tête
  addHeader(doc, data, yPosition, pageWidth)
  yPosition += 40

  // Informations client
  addCustomerInfo(doc, data, yPosition, pageWidth)
  yPosition += 35

  // Informations facture
  addInvoiceInfo(doc, data, yPosition, pageWidth)
  yPosition += 30

  // Lignes de facturation
  addInvoiceLines(doc, data, yPosition, pageWidth)
  yPosition += 80

  // Totaux
  addTotals(doc, data, yPosition, pageWidth, includeVat)
  yPosition += 40

  // Notes et conditions
  if (data.notes || data.paymentTerms) {
    addNotes(doc, data, yPosition, pageWidth)
    yPosition += 30
  }

  // Pied de page
  addFooter(doc, data, pageWidth, pageHeight)

  // Watermark
  if (watermark) {
    addWatermark(doc, watermark, pageWidth, pageHeight)
  }

  // Barcode
  if (includeBarcode) {
    addBarcode(doc, data.invoice.number, pageWidth, pageHeight)
  }

  return doc.output("blob")
  */
}

/*
// Fonctions helper pour jsPDF (à activer après installation)
function addHeader(doc: jsPDF, data: InvoiceData, y: number, width: number) { ... }
function addCustomerInfo(doc: jsPDF, data: InvoiceData, y: number, width: number) { ... }
function addInvoiceInfo(doc: jsPDF, data: InvoiceData, y: number, width: number) { ... }
function addInvoiceLines(doc: jsPDF, data: InvoiceData, y: number, width: number) { ... }
function addTotals(doc: jsPDF, data: InvoiceData, y: number, width: number, includeVat: boolean) { ... }
function addNotes(doc: jsPDF, data: InvoiceData, y: number, width: number) { ... }
function addFooter(doc: jsPDF, data: InvoiceData, width: number, height: number) { ... }
function addWatermark(doc: jsPDF, text: string, width: number, height: number) { ... }
function addBarcode(doc: jsPDF, text: string, width: number, height: number) { ... }
*/

/**
 * Formate une date
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * Formate un montant en devise
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: "TND",
  }).format(amount)
}

/**
 * Génère une facture à partir d'une entrée comptable
 */
export function generateInvoiceFromJournalEntry(
  journalEntry: JournalEntry,
  lines: JournalLine[],
  issuer: InvoiceData["issuer"],
  customer: InvoiceData["customer"]
): InvoiceData {
  const debitLines = lines.filter((l) => Number(l.debit) > 0)
  const creditLines = lines.filter((l) => Number(l.credit) > 0)

  const invoiceLines: InvoiceData["lines"] = debitLines.map((line) => ({
    description: line.description || line.accountName,
    quantity: 1,
    unitPrice: Number(line.debit),
    vatRate: 0, // À configurer selon le compte
    total: Number(line.debit),
  }))

  const subtotal = invoiceLines.reduce((sum, line) => sum + line.total, 0)
  const vatAmount = 0 // À calculer selon les taux TVA
  const total = subtotal + vatAmount

  return {
    issuer,
    customer,
    invoice: {
      number: journalEntry.reference,
      date: new Date(journalEntry.entryDate),
      type: "facture",
    },
    lines: invoiceLines,
    totals: {
      subtotal,
      vatAmount,
      total,
    },
  }
}
