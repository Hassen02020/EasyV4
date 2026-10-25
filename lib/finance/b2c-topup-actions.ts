"use server"

/**
 * Actions serveur B2C — wallet client.
 *
 * submitCustomerTopUp — initiation d'une recharge wallet via Paymee.
 * submitManualTopUp — déclaration d'une recharge manuelle (virement,
 *   versement, espèces à l'agence, D17), validée ensuite par l'équipe.
 * createCustomerProfile — création/liaison du profil client (bootstrap wallet).
 */

import { eq, and } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers, customerTopupRequests } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { PaymeePaymentProvider } from "@/lib/payment/paymee-provider"
import { logger } from "@/lib/logger"
import { resolveOrCreateLinkedCustomer } from "@/lib/booking/customer-identity"
import {
  createManualTopupRequest,
  parseTopupAmount,
  type CreateManualTopupResult,
} from "@/lib/finance/customer-topup-manual-core"

const MIN_AMOUNT_TND = 10
const MAX_AMOUNT_TND = 5000

export type SubmitTopUpResult =
  | { ok: true; paymentUrl: string }
  | { ok: false; error: string }

/** Message affiché quand la recharge en ligne n'est pas configurée sur ce
 * déploiement (aucune clé Paymee) — aucune demande n'est alors créée. */
const TOPUP_ONLINE_UNAVAILABLE_ERROR =
  "La recharge en ligne n'est pas disponible pour le moment. Veuillez réessayer plus tard ou contacter notre agence."

export async function submitCustomerTopUp(
  amountTnd: number,
  locale?: string,
): Promise<SubmitTopUpResult> {
  if (
    !Number.isFinite(amountTnd) ||
    amountTnd < MIN_AMOUNT_TND ||
    amountTnd > MAX_AMOUNT_TND
  ) {
    return {
      ok: false,
      error: `Montant invalide. Le montant doit être compris entre ${MIN_AMOUNT_TND} et ${MAX_AMOUNT_TND} TND.`,
    }
  }
  // Deux décimales au plus — jamais d'arrondi silencieux (colonne NUMERIC(14,2)).
  const parsedAmount = parseTopupAmount(amountTnd)
  if (!parsedAmount.ok) {
    return { ok: false, error: TOPUP_ERROR_MESSAGES[parsedAmount.code] }
  }

  // WALLET-PAYMEE-INIT-01 : vérifier la configuration AVANT toute écriture.
  // Sans clé, l'ancien flux insérait la demande puis la marquait « failed »
  // (demande fantôme + message générique).
  const provider = new PaymeePaymentProvider()
  if (!provider.configured) {
    return { ok: false, error: TOPUP_ONLINE_UNAVAILABLE_ERROR }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      error: "Vous devez être connecté pour recharger votre wallet.",
    }
  }

  const tenant = await guestTenantContext()
  if (!tenant || !tenant.agencyId) {
    return { ok: false, error: "Agence introuvable." }
  }
  const agencyId: string = tenant.agencyId

  let customerId: string
  let customerEmail: string
  let customerFirstName: string | null
  let customerLastName: string | null
  let customerPhone: string | null

  try {
    const customerRow = await withTenantContext(tenant, async (tx) => {
      const [customer] = await tx
        .select({
          id: customers.id,
          email: customers.email,
          firstName: customers.firstName,
          lastName: customers.lastName,
          phone: customers.phone,
        })
        .from(customers)
        .where(
          and(
            eq(customers.authUserId, user.id),
            eq(customers.agencyId, agencyId),
          ),
        )
        .limit(1)
      return customer ?? null
    })

    if (!customerRow) {
      return { ok: false, error: "Profil client introuvable." }
    }

    customerId = customerRow.id
    if (!customerRow.email) {
      return { ok: false, error: "Adresse email client manquante." }
    }
    customerEmail = customerRow.email
    customerFirstName = customerRow.firstName ?? null
    customerLastName = customerRow.lastName ?? null
    customerPhone = customerRow.phone ?? null
  } catch (err: unknown) {
    logger.error("[submitCustomerTopUp] customer lookup failed", { error: err })
    return { ok: false, error: "Erreur lors de la recherche du profil client." }
  }

  // Création de la demande de recharge
  let topupId: string
  try {
    const insertedRow = await withTenantContext(tenant, async (tx) => {
      const [record] = await tx
        .insert(customerTopupRequests)
        .values({
          customerId,
          agencyId,
          amount: parsedAmount.amount,
          status: "pending",
          method: "card",
          psp: "paymee",
        })
        .returning({ id: customerTopupRequests.id })
      return record
    })

    topupId = insertedRow.id

    // payment_reference = id de la demande (= order_id Paymee), idempotency_key = id
    await withTenantContext(tenant, async (tx) => {
      await tx
        .update(customerTopupRequests)
        .set({
          paymentReference: topupId,
          idempotencyKey: topupId,
        })
        .where(eq(customerTopupRequests.id, topupId))
    })
  } catch (err: unknown) {
    logger.error("[submitCustomerTopUp] insert topup request failed", {
      error: err,
    })
    return {
      ok: false,
      error: "Erreur lors de la création de la demande de recharge.",
    }
  }

  // Appel Paymee — purpose wallet_topup : webhook /api/payment/webhook
  // (corrélation customer_topup_requests) et retour sur la page wallet.
  const paymentResult = await provider.createPayment({
    purpose: "wallet_topup",
    locale,
    amountTnd,
    currency: "TND",
    reference: topupId,
    description: `Recharge wallet Easy2Book — ${amountTnd.toFixed(3)} TND`,
    customerEmail,
    customerFirstName: customerFirstName ?? undefined,
    customerLastName: customerLastName ?? undefined,
    customerPhone: customerPhone ?? undefined,
  })

  if (!paymentResult.ok || !paymentResult.redirectUrl) {
    logger.error("[submitCustomerTopUp] Paymee createPayment failed", {
      topupId,
      result: paymentResult,
    })
    // Marque la demande en échec pour éviter une demande fantôme
    try {
      await withTenantContext(tenant, async (tx) => {
        await tx
          .update(customerTopupRequests)
          .set({ status: "failed" })
          .where(eq(customerTopupRequests.id, topupId))
      })
    } catch {
      // best-effort
    }
    return {
      ok: false,
      error: "Impossible d'initier le paiement. Veuillez réessayer.",
    }
  }

  // Stocke le token Paymee sur la demande
  const paymeeToken = paymentResult.providerPaymentId ?? null
  try {
    await withTenantContext(tenant, async (tx) => {
      await tx
        .update(customerTopupRequests)
        .set({ paymeeToken })
        .where(eq(customerTopupRequests.id, topupId))
    })
  } catch {
    // Non bloquant — le token est utile pour le support mais pas critique
  }

  return { ok: true, paymentUrl: paymentResult.redirectUrl }
}

/* -------------------------------------------------------------------------- */
/* submitManualTopUp — WALLET-B2C-RECHARGE-METHODS-01                         */
/* -------------------------------------------------------------------------- */

export type SubmitManualTopUpResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string }

const TOPUP_ERROR_MESSAGES: Record<
  Exclude<CreateManualTopupResult, { ok: true }>["code"],
  string
> = {
  INVALID_METHOD: "Moyen de recharge invalide.",
  METHOD_UNAVAILABLE: "Ce moyen de recharge n'est pas disponible.",
  INVALID_AMOUNT: "Montant invalide.",
  TOO_PRECISE: "Le montant ne peut pas comporter plus de deux décimales.",
  OUT_OF_RANGE: `Le montant doit être compris entre ${MIN_AMOUNT_TND} et ${MAX_AMOUNT_TND} TND.`,
  INVALID_REFERENCE: "Référence invalide (64 caractères maximum).",
  INVALID_NOTE: "Note trop longue (500 caractères maximum).",
  TOO_MANY_PENDING:
    "Vous avez déjà plusieurs demandes en attente. Merci d'attendre leur traitement.",
  CUSTOMER_NOT_FOUND: "Profil client introuvable.",
}

/**
 * Déclare une recharge manuelle. Aucune écriture wallet : la demande reste
 * `pending` jusqu'à vérification de la réception réelle par l'équipe
 * (lib/finance/b2c-topup-review-actions.ts). Le client et l'agence sont
 * résolus côté serveur, jamais fournis par le navigateur.
 */
export async function submitManualTopUp(input: {
  method: string
  amount: string
  reference?: string
  note?: string
}): Promise<SubmitManualTopUpResult> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return {
      ok: false,
      error: "Vous devez être connecté pour recharger votre wallet.",
    }
  }

  const tenant = await guestTenantContext()
  if (!tenant?.agencyId) return { ok: false, error: "Agence introuvable." }
  const agencyId = tenant.agencyId

  try {
    const result = await withTenantContext(tenant, async (tx) => {
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.authUserId, user.id),
            eq(customers.agencyId, agencyId),
          ),
        )
        .limit(1)
      if (!customer) return null
      return createManualTopupRequest(tx, {
        agencyId,
        customerId: customer.id,
        actorUserId: user.id,
        method: input.method,
        amount: input.amount,
        customerReference: input.reference,
        note: input.note,
      })
    })

    if (!result) return { ok: false, error: "Profil client introuvable." }
    if (!result.ok) {
      return { ok: false, error: TOPUP_ERROR_MESSAGES[result.code] }
    }
    revalidatePath("/compte/wallet")
    return { ok: true, requestId: result.requestId }
  } catch (err: unknown) {
    logger.error("[submitManualTopUp] failed", { error: err })
    return {
      ok: false,
      error: "Erreur lors de l'enregistrement de la demande de recharge.",
    }
  }
}

/* -------------------------------------------------------------------------- */
/* createCustomerProfile — bootstrap wallet (WALLET-BOOTSTRAP-01)             */
/* -------------------------------------------------------------------------- */

export type CreateCustomerProfileResult =
  | { ok: true; customerId: string }
  | { ok: false; error: string }

/**
 * Crée (ou retrouve) le profil client B2C pour l'utilisateur authentifié.
 *
 * Règles de sécurité :
 *  - L'identité (user.id, user.email) est résolue côté serveur via Supabase
 *    Auth — jamais fournie par le client.
 *  - L'agencyId vient de guestTenantContext() — jamais fourni par le client.
 *  - La création est idempotente : resolveOrCreateLinkedCustomer fait un
 *    find-or-create par (agencyId, email) et ne crée pas de doublon si le
 *    profil existe déjà.
 *  - Aucune écriture sur le ledger, le wallet ou les paiements — uniquement
 *    la table `customers`.
 */
export async function createCustomerProfile(
  firstName: string,
  lastName: string,
): Promise<CreateCustomerProfileResult> {
  const firstNameClean = (firstName ?? "").trim()
  const lastNameClean = (lastName ?? "").trim()

  if (!firstNameClean || firstNameClean.length > 100) {
    return { ok: false, error: "Prénom invalide (1–100 caractères)." }
  }
  if (!lastNameClean || lastNameClean.length > 100) {
    return { ok: false, error: "Nom invalide (1–100 caractères)." }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.email) {
    return { ok: false, error: "Vous devez être connecté." }
  }

  const tenant = await guestTenantContext()
  if (!tenant?.agencyId) {
    return { ok: false, error: "Agence introuvable." }
  }

  try {
    const customerId = await withTenantContext(tenant, (tx) =>
      resolveOrCreateLinkedCustomer(tx, {
        agencyId: tenant.agencyId!,
        traveler: {
          firstName: firstNameClean,
          lastName: lastNameClean,
          email: user.email!,
        },
        linkedAuthUserId: user.id,
      }),
    )
    revalidatePath("/compte/wallet")
    return { ok: true, customerId }
  } catch (err: unknown) {
    logger.error("[createCustomerProfile] failed", { error: err })
    return { ok: false, error: "Erreur lors de la création du profil." }
  }
}
