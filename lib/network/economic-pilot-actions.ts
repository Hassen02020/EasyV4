"use server"

/**
 * ECON-PILOT-01 — premier branchement réel Supplier Node → Product
 * (canonique) → Cost → Margin → Booking → Financial, sur UN secteur
 * (activity), staff-only, V1 sans flux client public.
 *
 * Réutilise sans modification :
 *  - margin_rules / lib/finance/margin-calculator.ts (Système B, déjà réel,
 *    déjà utilisé par les hôtels) — jamais une deuxième formule de marge ;
 *  - reservation_financials / recordReservationFinancials (déjà réel, déjà
 *    câblé dans 7 modules) — reçoit ici un supplierPriceTnd RÉEL au lieu du
 *    raccourci `supplierPriceTnd = salePriceTnd` utilisé par
 *    Activités/Omra ;
 *  - commission-settlement.ts (déjà réel, agnostique de l'origine du
 *    montant) — aucun changement requis ;
 *  - getDefaultAgencyId() (déjà réel, même précédent que le guest checkout
 *    B2C) — un produit Network n'a pas d'agence propre, `products.agencyId`
 *    reste NOT NULL, on réutilise l'agence OTA par défaut plutôt que de
 *    relâcher la contrainte.
 *
 * Périmètre volontairement étroit (voir design report ECON-PILOT-01A) :
 * un produit = un supplier_node (pas de multi-fournisseur), pas de
 * channel-pricing (B2C/B2B/Partner reste hors scope, seul commercial-engine.ts
 * pour les vols en a un — dette documentée, pas résolue ici), réservation
 * staff-only (jamais de paiement réel, jamais de session self-service
 * fournisseur).
 */

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  products,
  supplierNodes,
  customers,
  reservations,
  reservationNetworkProduct,
  marginRules,
  auditEvents,
} from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { nextPublicRef } from "@/lib/booking/actions"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import {
  findApplicableMarginRule,
  calculateMargin,
  type MarginCalculationContext,
} from "@/lib/finance/margin-calculator"

async function requireSuperAdmin() {
  if (!process.env.DATABASE_URL)
    return { ok: false as const, error: "Base de données non configurée" }
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.role !== "super_admin") {
    return { ok: false as const, error: "Réservé aux super_admin." }
  }
  return { ok: true as const, user }
}

/* -------------------------------------------------------------------------- */
/* Création d'un produit canonique porté par un supplier_node               */
/* -------------------------------------------------------------------------- */

const createProductInputSchema = z.object({
  supplierNodeId: z.string().uuid(),
  name: z.string().trim().min(1).max(255),
  /** `products.type` — réutilise l'enum existant, "activity" pour le pilote
   * (Guide → Visite, exemple du design report), pas de nouvelle valeur. */
  type: z.enum([
    "hotel",
    "flight",
    "package",
    "activity",
    "transfer",
    "omra",
    "car",
  ]),
  costPrice: z.number().positive(),
  costCurrency: z.string().trim().length(3).default("TND"),
  destination: z.string().trim().max(128).optional(),
})

export type CreateNetworkProductResult =
  | { ok: true; productId: string }
  | { ok: false; error: string }

export async function createNetworkProduct(
  raw: z.infer<typeof createProductInputSchema>,
): Promise<CreateNetworkProductResult> {
  const parsed = createProductInputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Entrée invalide : " +
        parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  const input = parsed.data

  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  const defaultAgencyId = await getDefaultAgencyId()
  if (!defaultAgencyId) {
    return {
      ok: false,
      error: "Aucune agence de vente directe n'est configurée pour le moment.",
    }
  }

  const [node] = await withSystemContext((db) =>
    db
      .select({ id: supplierNodes.id })
      .from(supplierNodes)
      .where(eq(supplierNodes.id, input.supplierNodeId))
      .limit(1),
  )
  if (!node) return { ok: false, error: "Nœud fournisseur introuvable." }

  const sku = `NET-${input.supplierNodeId.slice(0, 8)}-${Date.now().toString(36)}`

  const [product] = await withSystemContext((db) =>
    db
      .insert(products)
      .values({
        agencyId: defaultAgencyId,
        supplierNodeId: input.supplierNodeId,
        sku,
        type: input.type,
        status: "active",
        name: input.name,
        destination: input.destination,
        costPrice: input.costPrice.toFixed(3),
        costCurrency: input.costCurrency,
        // basePrice reste requis par le schéma existant (NOT NULL) — non
        // pertinent pour un produit Network (le prix de vente n'est jamais
        // stocké, il est dérivé à la réservation), on y recopie le coût par
        // défaut pour ne jamais laisser un 0 trompeur.
        basePrice: input.costPrice.toFixed(3),
        currency: input.costCurrency,
      })
      .returning({ id: products.id }),
  )
  if (!product) return { ok: false, error: "Échec de la création du produit." }

  revalidatePath("/admin/suppliers/nodes")
  return { ok: true, productId: product.id }
}

/* -------------------------------------------------------------------------- */
/* Réservation de test (staff-only) — prouve la chaîne bout en bout          */
/* -------------------------------------------------------------------------- */

const testBookingInputSchema = z.object({
  productId: z.string().uuid(),
  customerId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
})

export type CreateNetworkProductTestBookingResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      supplierPriceTnd: number
      salePriceTnd: number
      marginAmount: number
      commissionAmount: number
    }
  | { ok: false; error: string }

/**
 * Crée une réservation staff-only pour un produit Network — jamais de
 * paiement réel, jamais exposée au client. Prouve uniquement que la chaîne
 * Cost → Margin (margin-calculator.ts réel) → reservation_financials
 * (déjà réel) fonctionne bout en bout pour un produit canonique.
 */
export async function createNetworkProductTestBooking(
  raw: z.infer<typeof testBookingInputSchema>,
): Promise<CreateNetworkProductTestBookingResult> {
  const parsed = testBookingInputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Entrée invalide : " +
        parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  const input = parsed.data

  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  const defaultAgencyId = await getDefaultAgencyId()
  if (!defaultAgencyId) {
    return {
      ok: false,
      error: "Aucune agence de vente directe n'est configurée pour le moment.",
    }
  }

  const [product] = await withSystemContext((db) =>
    db.select().from(products).where(eq(products.id, input.productId)).limit(1),
  )
  if (!product) return { ok: false, error: "Produit introuvable." }
  if (!product.supplierNodeId) {
    return {
      ok: false,
      error: "Ce produit n'est pas un produit Network (supplierNodeId absent).",
    }
  }
  if (!product.costPrice) {
    return {
      ok: false,
      error: "Ce produit n'a pas de coût fournisseur renseigné.",
    }
  }

  const [customer] = await withSystemContext((db) =>
    db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, input.customerId))
      .limit(1),
  )
  if (!customer)
    return {
      ok: false,
      error: "Client introuvable — un client réel est requis.",
    }

  const costPriceTnd = Number(product.costPrice) * input.quantity

  const rulesRows = await withSystemContext((db) =>
    db
      .select()
      .from(marginRules)
      .where(eq(marginRules.agencyId, defaultAgencyId)),
  )

  const marginContext: MarginCalculationContext = {
    agencyId: defaultAgencyId,
    productType: product.type,
    destination: product.destination ?? undefined,
    supplierPrice: costPriceTnd,
    supplierCurrency: product.costCurrency ?? "TND",
  }
  const rule = findApplicableMarginRule(rulesRows, marginContext)
  const marginResult = calculateMargin(marginContext, rule)

  const outcome = await withTenantContext(
    { agencyId: defaultAgencyId, userId: user.id, isSuperAdmin: true },
    async (tx) => {
      const publicRef = await nextPublicRef(tx, defaultAgencyId)
      const now = new Date()

      const [reservation] = await tx
        .insert(reservations)
        .values({
          agencyId: defaultAgencyId,
          publicRef,
          customerId: input.customerId,
          module: "network",
          source: "internal",
          status: "confirmed",
          originalCurrency: "TND",
          originalAmount: marginResult.salePriceTnd.toFixed(2),
          tndAmount: marginResult.salePriceTnd.toFixed(2),
          depositAmount: marginResult.salePriceTnd.toFixed(2),
          depositPaid: marginResult.salePriceTnd.toFixed(2),
          confirmedAt: now,
          createdByUserId: user.id,
        })
        .returning({ id: reservations.id })
      if (!reservation)
        throw new Error(
          "createNetworkProductTestBooking: insert reservations a échoué",
        )

      await tx.insert(reservationNetworkProduct).values({
        reservationId: reservation.id,
        productId: input.productId,
        supplierNodeId: product.supplierNodeId!,
        quantity: input.quantity,
      })

      const { commissionAmount } = await recordReservationFinancials({
        tx,
        reservationId: reservation.id,
        supplierPriceTnd: marginResult.supplierPriceTnd,
        salePriceTnd: marginResult.salePriceTnd,
        commissionPercent: marginResult.commissionPercent,
        marginRuleId: marginResult.marginRuleId,
      })

      await tx.insert(auditEvents).values({
        agencyId: defaultAgencyId,
        actorUserId: user.id,
        entityType: "reservation",
        entityId: reservation.id,
        action: "reservation.created",
        diff: {
          productId: input.productId,
          supplierNodeId: product.supplierNodeId,
          via: "econ_pilot_01_staff_test_booking",
        },
      })

      return {
        reservationId: reservation.id,
        publicRef,
        commissionAmount,
      }
    },
  )

  return {
    ok: true,
    reservationId: outcome.reservationId,
    publicRef: outcome.publicRef,
    supplierPriceTnd: marginResult.supplierPriceTnd,
    salePriceTnd: marginResult.salePriceTnd,
    marginAmount: marginResult.marginAmount,
    commissionAmount: outcome.commissionAmount,
  }
}
