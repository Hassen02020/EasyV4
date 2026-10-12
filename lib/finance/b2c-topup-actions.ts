"use server"

/**
 * Action serveur B2C — initiation d'une recharge wallet client via Paymee.
 *
 * Séquence :
 *  1. Résout la session (Supabase Auth) et le tenant (agencyId via guestTenantContext)
 *  2. Retrouve le customer par (authUserId + agencyId)
 *  3. Valide le montant (10–5000 TND)
 *  4. Crée un enregistrement `customer_topup_requests` en status `pending`
 *     → payment_reference = id de la demande (envoyé comme order_id à Paymee)
 *     → idempotency_key = id (clé pour creditCustomerWallet)
 *  5. Appelle Paymee createPayment → obtient le payment_url
 *  6. Met à jour le record avec le paymee_token
 *  7. Retourne { ok: true, paymentUrl }
 */

import { eq, and } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers, customerTopupRequests } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { PaymeePaymentProvider } from "@/lib/payment/paymee-provider"
import { logger } from "@/lib/logger"

const MIN_AMOUNT_TND = 10
const MAX_AMOUNT_TND = 5000

export type SubmitTopUpResult =
  | { ok: true; paymentUrl: string }
  | { ok: false; error: string }

export async function submitCustomerTopUp(
  amountTnd: number,
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
          amount: String(amountTnd),
          status: "pending",
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

  // Appel Paymee
  const provider = new PaymeePaymentProvider()
  const paymentResult = await provider.createPayment({
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
