/**
 * WALLET-B2C-RECHARGE-METHODS-01 — recharges wallet B2C manuelles.
 *
 * Moyens : virement bancaire, versement bancaire, espèces à l'agence, D17
 * (déclaration manuelle — aucune intégration D17 officielle). Le client
 * déclare une recharge (`pending`) ; un membre de l'équipe autorisé
 * vérifie la réception réelle puis valide (crédit) ou rejette (motif).
 *
 * Invariants :
 *  - le crédit passe UNIQUEMENT par `creditCustomerWallet` (wallet_ledger),
 *    dans la même transaction que le verrou `FOR UPDATE` de la demande et
 *    que son passage à `completed` — clé d'idempotence = id de la demande ;
 *  - une demande manuelle n'a jamais de PSP ni de `payment_reference` :
 *    aucun webhook ne peut la créditer (contrainte SQL 0141 + garde de
 *    lib/payment/customer-topup-webhook-core.ts) ;
 *  - l'identité et le rôle du validateur viennent de la session (passés par
 *    l'action serveur), jamais du client ;
 *  - un moyen inactif ou dont les coordonnées sont incomplètes n'est jamais
 *    proposé ni accepté. Aucune coordonnée n'est codée ici.
 *
 * Fonctions prenant une transaction déjà ouverte (même convention que
 * lib/payment/customer-topup-webhook-core.ts) : testables contre un vrai
 * Postgres sans session Next.js.
 */

import { randomUUID } from "node:crypto"
import { and, desc, eq, ne } from "drizzle-orm"

import {
  auditEvents,
  customers,
  customerTopupRequests,
  topupPaymentMethods,
} from "@/lib/db/schema"
import type { DrizzleTransaction } from "@/lib/db/client"
import { getEffectivePermission } from "@/lib/auth/permissions"
import {
  creditCustomerWallet,
  type CreditCustomerWalletInput,
  type WalletRechargeMethod,
} from "@/lib/finance/customer-wallet"

/* -------------------------------------------------------------------------- */
/* Montant — 10 à 5 000 TND, deux décimales au plus, jamais tronqué          */
/* -------------------------------------------------------------------------- */

export const TOPUP_MIN_TND = 10
export const TOPUP_MAX_TND = 5000

export type ParsedTopupAmount =
  | { ok: true; amount: string; amountTnd: number }
  | { ok: false; code: "INVALID_AMOUNT" | "TOO_PRECISE" | "OUT_OF_RANGE" }

/** Accepte un nombre ou une chaîne (virgule décimale admise). Refuse toute
 * valeur à plus de deux décimales au lieu de l'arrondir. */
export function parseTopupAmount(raw: unknown): ParsedTopupAmount {
  let text: string
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, code: "INVALID_AMOUNT" }
    text = String(raw)
  } else if (typeof raw === "string") {
    text = raw.trim().replace(",", ".")
  } else {
    return { ok: false, code: "INVALID_AMOUNT" }
  }

  const match = /^(\d{1,9})(?:\.(\d+))?$/.exec(text)
  if (!match) return { ok: false, code: "INVALID_AMOUNT" }
  const decimals = match[2] ?? ""
  if (decimals.length > 2) return { ok: false, code: "TOO_PRECISE" }

  const cents = Number(match[1]) * 100 + Number(decimals.padEnd(2, "0") || "0")
  if (cents < TOPUP_MIN_TND * 100 || cents > TOPUP_MAX_TND * 100) {
    return { ok: false, code: "OUT_OF_RANGE" }
  }
  const amount = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`
  return { ok: true, amount, amountTnd: cents / 100 }
}

/* -------------------------------------------------------------------------- */
/* Moyens manuels et leurs coordonnées                                        */
/* -------------------------------------------------------------------------- */

export const MANUAL_TOPUP_METHODS = [
  "bank_transfer",
  "bank_deposit",
  "cash_agency",
  "d17",
] as const

export type ManualTopupMethod = (typeof MANUAL_TOPUP_METHODS)[number]

export function isManualTopupMethod(v: unknown): v is ManualTopupMethod {
  return (
    typeof v === "string" &&
    (MANUAL_TOPUP_METHODS as readonly string[]).includes(v)
  )
}

type FieldRule = { required: boolean; pattern?: RegExp; maxLength: number }

const TEXT: FieldRule = { required: true, maxLength: 200 }
const OPTIONAL_TEXT: FieldRule = { required: false, maxLength: 200 }
/** RIB tunisien : 20 chiffres (espaces tolérés à la saisie, retirés). */
const RIB: FieldRule = { required: true, pattern: /^\d{20}$/, maxLength: 20 }
const IBAN: FieldRule = {
  required: false,
  pattern: /^TN\d{22}$/,
  maxLength: 24,
}
const BIC: FieldRule = {
  required: false,
  pattern: /^[A-Z0-9]{8}([A-Z0-9]{3})?$/,
  maxLength: 11,
}

/** Champs attendus par moyen — seuls ceux-ci sont conservés. Les valeurs
 * sont saisies par le super_admin ; rien n'est pré-rempli. */
export const TOPUP_METHOD_FIELDS: Record<
  ManualTopupMethod,
  Record<string, FieldRule>
> = {
  bank_transfer: {
    beneficiary: TEXT,
    bank_name: TEXT,
    rib: RIB,
    iban: IBAN,
    bic: BIC,
  },
  bank_deposit: {
    beneficiary: TEXT,
    bank_name: TEXT,
    rib: RIB,
  },
  cash_agency: {
    agency_name: TEXT,
    address: TEXT,
    opening_hours: TEXT,
    phone: OPTIONAL_TEXT,
  },
  d17: {
    beneficiary: TEXT,
    d17_number: { required: true, pattern: /^\d{8}$/, maxLength: 8 },
  },
}

const COMPACT_FIELDS = new Set(["rib", "iban", "bic", "d17_number"])

export type NormalizedDetails =
  | { ok: true; details: Record<string, string>; complete: boolean }
  | { ok: false; errors: string[] }

/** Nettoie et valide les coordonnées saisies. `complete` = tous les champs
 * obligatoires présents et valides. Une valeur présente mais mal formée est
 * une erreur (jamais ignorée en silence). */
export function normalizeMethodDetails(
  method: ManualTopupMethod,
  input: Record<string, unknown>,
): NormalizedDetails {
  const fields = TOPUP_METHOD_FIELDS[method]
  const details: Record<string, string> = {}
  const errors: string[] = []
  let complete = true

  for (const [key, rule] of Object.entries(fields)) {
    const raw = input[key]
    let value = typeof raw === "string" ? raw.trim() : ""
    if (COMPACT_FIELDS.has(key)) value = value.replace(/\s+/g, "").toUpperCase()
    if (!value) {
      if (rule.required) complete = false
      continue
    }
    if (value.length > rule.maxLength) {
      errors.push(`${key}: trop long`)
      continue
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${key}: format invalide`)
      continue
    }
    details[key] = value
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, details, complete }
}

export function isMethodConfigComplete(
  method: ManualTopupMethod,
  details: Record<string, unknown>,
): boolean {
  const n = normalizeMethodDetails(method, details)
  return n.ok && n.complete
}

export interface AvailableManualMethod {
  method: ManualTopupMethod
  details: Record<string, string>
  instructions: string | null
}

/** Moyens réellement proposables : actifs ET complets. */
export async function loadAvailableManualMethods(
  tx: DrizzleTransaction,
  agencyId: string,
): Promise<AvailableManualMethod[]> {
  const rows = await tx
    .select()
    .from(topupPaymentMethods)
    .where(
      and(
        eq(topupPaymentMethods.agencyId, agencyId),
        eq(topupPaymentMethods.enabled, true),
      ),
    )
  const available: AvailableManualMethod[] = []
  for (const method of MANUAL_TOPUP_METHODS) {
    const row = rows.find((r) => r.method === method)
    if (!row) continue
    const n = normalizeMethodDetails(method, row.details ?? {})
    if (!n.ok || !n.complete) continue
    available.push({
      method,
      details: n.details,
      instructions: row.instructions ?? null,
    })
  }
  return available
}

export type SaveMethodResult =
  | { ok: true }
  | {
      ok: false
      code: "INVALID_METHOD" | "INVALID_DETAILS" | "INCOMPLETE"
      errors?: string[]
    }

/** Enregistre la configuration d'un moyen (super_admin — vérifié par
 * l'appelant ET par la policy RLS d'écriture). Refuse d'activer un moyen
 * incomplet. Trace dans audit_events. */
export async function saveTopupPaymentMethod(
  tx: DrizzleTransaction,
  input: {
    agencyId: string
    actorUserId: string
    method: unknown
    enabled: boolean
    details: Record<string, unknown>
    instructions?: string | null
  },
): Promise<SaveMethodResult> {
  if (!isManualTopupMethod(input.method)) {
    return { ok: false, code: "INVALID_METHOD" }
  }
  const method = input.method
  const n = normalizeMethodDetails(method, input.details)
  if (!n.ok) return { ok: false, code: "INVALID_DETAILS", errors: n.errors }
  if (input.enabled && !n.complete) return { ok: false, code: "INCOMPLETE" }

  const instructions = input.instructions?.trim().slice(0, 1000) || null
  const now = new Date()
  await tx
    .insert(topupPaymentMethods)
    .values({
      agencyId: input.agencyId,
      method,
      enabled: input.enabled,
      details: n.details,
      instructions,
      updatedByUserId: input.actorUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [topupPaymentMethods.agencyId, topupPaymentMethods.method],
      set: {
        enabled: input.enabled,
        details: n.details,
        instructions,
        updatedByUserId: input.actorUserId,
        updatedAt: now,
      },
    })

  await tx.insert(auditEvents).values({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    entityType: "topup_method",
    entityId: method,
    action: "topup_method.updated",
    diff: { enabled: input.enabled, details: n.details, instructions },
  })
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* Demande client                                                             */
/* -------------------------------------------------------------------------- */

/** Au-delà, le client doit attendre le traitement de ses demandes. */
export const MAX_PENDING_MANUAL_TOPUPS = 3

export type CreateManualTopupResult =
  | { ok: true; requestId: string }
  | {
      ok: false
      code:
        | "INVALID_METHOD"
        | "METHOD_UNAVAILABLE"
        | "INVALID_AMOUNT"
        | "TOO_PRECISE"
        | "OUT_OF_RANGE"
        | "INVALID_REFERENCE"
        | "INVALID_NOTE"
        | "TOO_MANY_PENDING"
        | "CUSTOMER_NOT_FOUND"
    }

export async function createManualTopupRequest(
  tx: DrizzleTransaction,
  input: {
    agencyId: string
    customerId: string
    /** auth user du client — pour l'audit uniquement. */
    actorUserId: string
    method: unknown
    amount: unknown
    customerReference?: string | null
    note?: string | null
  },
): Promise<CreateManualTopupResult> {
  if (!isManualTopupMethod(input.method)) {
    return { ok: false, code: "INVALID_METHOD" }
  }
  const method = input.method

  const parsed = parseTopupAmount(input.amount)
  if (!parsed.ok) return { ok: false, code: parsed.code }

  const reference = input.customerReference?.trim() || null
  if (reference && (reference.length > 64 || /[\r\n]/.test(reference))) {
    return { ok: false, code: "INVALID_REFERENCE" }
  }
  const note = input.note?.trim() || null
  if (note && note.length > 500) return { ok: false, code: "INVALID_NOTE" }

  const available = await loadAvailableManualMethods(tx, input.agencyId)
  if (!available.some((m) => m.method === method)) {
    return { ok: false, code: "METHOD_UNAVAILABLE" }
  }

  // Verrou sur le client : deux déclarations simultanées ne peuvent pas
  // dépasser ensemble le plafond de demandes en attente.
  const [customerRow] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, input.customerId),
        eq(customers.agencyId, input.agencyId),
      ),
    )
    .for("update")
  if (!customerRow) return { ok: false, code: "CUSTOMER_NOT_FOUND" }

  const pending = await tx
    .select({ id: customerTopupRequests.id })
    .from(customerTopupRequests)
    .where(
      and(
        eq(customerTopupRequests.customerId, input.customerId),
        eq(customerTopupRequests.status, "pending"),
        ne(customerTopupRequests.method, "card"),
      ),
    )
  if (pending.length >= MAX_PENDING_MANUAL_TOPUPS) {
    return { ok: false, code: "TOO_MANY_PENDING" }
  }

  const id = randomUUID()
  await tx.insert(customerTopupRequests).values({
    id,
    customerId: input.customerId,
    agencyId: input.agencyId,
    amount: parsed.amount,
    status: "pending",
    method,
    psp: null,
    paymentReference: null,
    idempotencyKey: id,
    customerReference: reference,
    customerNote: note,
  })

  await tx.insert(auditEvents).values({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    entityType: "customer_topup",
    entityId: id,
    action: "customer.topup_requested",
    diff: { method, amount: parsed.amount, customerReference: reference },
  })

  return { ok: true, requestId: id }
}

export async function listCustomerTopupRequests(
  tx: DrizzleTransaction,
  customerId: string,
  limit = 20,
) {
  return tx
    .select({
      id: customerTopupRequests.id,
      amount: customerTopupRequests.amount,
      method: customerTopupRequests.method,
      status: customerTopupRequests.status,
      customerReference: customerTopupRequests.customerReference,
      rejectionReason: customerTopupRequests.rejectionReason,
      createdAt: customerTopupRequests.createdAt,
      reviewedAt: customerTopupRequests.reviewedAt,
    })
    .from(customerTopupRequests)
    .where(eq(customerTopupRequests.customerId, customerId))
    .orderBy(desc(customerTopupRequests.createdAt))
    .limit(limit)
}

/* -------------------------------------------------------------------------- */
/* Revue équipe — validation (crédit) ou rejet                                */
/* -------------------------------------------------------------------------- */

/** Rôles de revue : super_admin et comptabilité, sous réserve de la
 * permission effective (rôle + overrides permission_grants). `manager`
 * détient wallet.topup.validate dans lib/auth/rbac.ts mais n'est pas un
 * rôle comptable : volontairement exclu. */
export const TOPUP_REVIEWER_ROLES = ["super_admin", "agent_compta"] as const

export interface TopupReviewer {
  userId: string
  role: string
  /** Agence du validateur (users.agency_id). */
  agencyId: string
  isSuperAdmin: boolean
}

export type ReviewTopupResult =
  | {
      ok: true
      status: "completed" | "rejected"
      ledgerId?: string
      balanceAfter?: string
    }
  | {
      ok: false
      code:
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "NOT_MANUAL"
        | "ALREADY_PROCESSED"
        | "REASON_REQUIRED"
        | "INVALID_AMOUNT"
        | "SELF_REVIEW"
      status?: string
    }

const WALLET_SOURCE: Record<ManualTopupMethod, WalletRechargeMethod> = {
  bank_transfer: "bank_transfer",
  bank_deposit: "bank_deposit",
  cash_agency: "cash",
  d17: "d17",
}

const METHOD_LABEL_FR: Record<ManualTopupMethod, string> = {
  bank_transfer: "virement bancaire",
  bank_deposit: "versement bancaire",
  cash_agency: "espèces à l'agence",
  d17: "D17",
}

export async function reviewManualTopupRequest(
  tx: DrizzleTransaction,
  input: {
    requestId: string
    decision: "approve" | "reject"
    reason?: string | null
    reviewer: TopupReviewer
  },
): Promise<ReviewTopupResult> {
  const { reviewer } = input

  if (
    !(TOPUP_REVIEWER_ROLES as readonly string[]).includes(reviewer.role) ||
    (reviewer.role === "super_admin") !== reviewer.isSuperAdmin
  ) {
    return { ok: false, code: "FORBIDDEN" }
  }
  const allowed = await getEffectivePermission({
    agencyId: reviewer.agencyId,
    userId: reviewer.userId,
    role: reviewer.role,
    permission:
      input.decision === "approve"
        ? "wallet.topup.validate"
        : "wallet.topup.reject",
    txOverride: tx,
  })
  if (!allowed) return { ok: false, code: "FORBIDDEN" }

  const reason = input.reason?.trim() ?? ""
  if (
    input.decision === "reject" &&
    (reason.length < 3 || reason.length > 500)
  ) {
    return { ok: false, code: "REASON_REQUIRED" }
  }

  const [request] = await tx
    .select()
    .from(customerTopupRequests)
    .where(eq(customerTopupRequests.id, input.requestId))
    .for("update")

  // Hors de son agence, un validateur non super_admin ne voit rien (RLS) ;
  // contrôle applicatif en plus, même réponse.
  if (
    !request ||
    (!reviewer.isSuperAdmin && request.agencyId !== reviewer.agencyId)
  ) {
    return { ok: false, code: "NOT_FOUND" }
  }
  if (!isManualTopupMethod(request.method)) {
    return { ok: false, code: "NOT_MANUAL" }
  }
  if (request.status !== "pending") {
    return { ok: false, code: "ALREADY_PROCESSED", status: request.status }
  }

  // Séparation des tâches : un membre de l'équipe peut aussi avoir un profil
  // client lié à son compte (createCustomerProfile) — il ne traite jamais
  // ses propres demandes.
  const [owner] = await tx
    .select({ authUserId: customers.authUserId })
    .from(customers)
    .where(eq(customers.id, request.customerId))
  if (owner?.authUserId && owner.authUserId === reviewer.userId) {
    return { ok: false, code: "SELF_REVIEW" }
  }

  const now = new Date()

  if (input.decision === "reject") {
    await tx
      .update(customerTopupRequests)
      .set({
        status: "rejected",
        rejectionReason: reason,
        reviewedByUserId: reviewer.userId,
        reviewedAt: now,
      })
      .where(eq(customerTopupRequests.id, request.id))
    await tx.insert(auditEvents).values({
      agencyId: request.agencyId,
      actorUserId: reviewer.userId,
      entityType: "customer_topup",
      entityId: request.id,
      action: "customer.topup_rejected",
      diff: {
        method: request.method,
        amount: request.amount,
        reason,
        customerId: request.customerId,
      },
    })
    return { ok: true, status: "rejected" }
  }

  const amount = parseTopupAmount(String(request.amount))
  if (!amount.ok) return { ok: false, code: "INVALID_AMOUNT" }

  const method = request.method
  const credit = await creditCustomerWallet({
    customerId: request.customerId,
    amountTnd: amount.amountTnd,
    source: WALLET_SOURCE[method],
    idempotencyKey: request.id,
    description:
      `Recharge wallet — ${METHOD_LABEL_FR[method]}` +
      (request.customerReference ? ` (réf. ${request.customerReference})` : ""),
    txOverride: tx as unknown as CreditCustomerWalletInput["txOverride"],
  })
  if (!credit.ok) {
    // Annule toute la transaction (aucun changement de statut sans crédit).
    throw new Error(`TOPUP_CREDIT_FAILED:${credit.code}`)
  }

  await tx
    .update(customerTopupRequests)
    .set({
      status: "completed",
      completedAt: now,
      reviewedByUserId: reviewer.userId,
      reviewedAt: now,
    })
    .where(eq(customerTopupRequests.id, request.id))

  await tx.insert(auditEvents).values({
    agencyId: request.agencyId,
    actorUserId: reviewer.userId,
    entityType: "customer_topup",
    entityId: request.id,
    action: "customer.topup_validated",
    diff: {
      method,
      amount: amount.amount,
      customerId: request.customerId,
      ledgerId: credit.ledgerId,
      balanceAfter: credit.balanceAfter,
    },
  })

  return {
    ok: true,
    status: "completed",
    ledgerId: credit.ledgerId,
    balanceAfter: credit.balanceAfter,
  }
}
