"use server"

/**
 * DISTRIBUTION-02 — réservation B2B RÉELLE d'un Network Product autorisé
 * (product_authorizations, DISTRIBUTION-01). Mirror exact du pattern déjà
 * prouvé 3x (`createActivityBooking`/`createPackageBooking`/
 * `createOmraBooking`) : session partenaire réelle via
 * `resolveSessionContext()`, débit du compte de dépôt via
 * `debitPartnerCredit` (idempotent, même transaction), verrouillage
 * implicite par la RLS `products` (DISTRIBUTION-01) qui ne laisse
 * apparaître que les produits possédés ou autorisés.
 *
 * Différence volontaire avec `createActivityBooking`/Omra : la marge est
 * RÉELLE ici, jamais le raccourci `supplierPriceTnd = salePriceTnd` —
 * Network Product a un coût fournisseur distinct dès la création
 * (ECON-PILOT-01), pas de raison de le masquer ici.
 *
 * COMMERCIAL-CONVERGENCE-01 (2026-09-29) : la marge vient de
 * `getMarginsForAgency()`/`applyMargin()` (lib/pro/pricing.ts +
 * lib/pro/server-context.ts, module "network") — EXACTEMENT le moteur
 * réel déjà utilisé par hotel/flight/transfer/hôtels-monde, jamais une
 * deuxième formule. Configurable par l'agence via `/pro/marges`
 * (`upsertMyPricingMargin`, table `pricing_margins`) et/ou par une règle
 * `margin_rules` (System B, fusionnée automatiquement par
 * `getMarginsForAgency`). Avant ce chantier, `product-booking-actions.ts`
 * lisait directement `margin_rules` via `margin-calculator.ts` — un moteur
 * SANS AUCUN chemin d'écriture applicatif (ni UI ni Server Action),
 * condamnant chaque réservation réelle à la marge de repli 10 % sans
 * qu'aucune agence ne puisse jamais la changer. `economic-pilot-actions.ts`
 * (ECON-PILOT-01, réservation de TEST staff-only, jamais de débit réel)
 * reste sur l'ancien moteur pour l'instant — hors périmètre de ce chantier,
 * qui porte sur le flux réel/financier uniquement.
 *
 * `agencyId` de la réservation = l'agence REVENDEUSE réelle (session), pas
 * l'agence par défaut du produit — même principe que
 * `createActivityBooking` : la réservation et le débit appartiennent au
 * revendeur, pas au propriétaire du catalogue.
 */

import { eq, sql } from "drizzle-orm"
import { z } from "zod"
import { resolveSessionContext, withTenantContext } from "@/lib/db/tenant-context"
import { products, customers, reservations, reservationNetworkProduct } from "@/lib/db/schema"
import { debitPartnerCredit } from "@/lib/pro/booking-actions"
import { nextPublicRef } from "@/lib/booking/actions"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission } from "@/lib/finance/platform-commission"
import { getMarginsForAgency } from "@/lib/pro/server-context"
import { applyMargin } from "@/lib/pro/pricing"

const bookingInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
  customerFirstName: z.string().trim().min(1).max(200),
  customerLastName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(1).max(32),
  customerEmail: z.string().trim().email().max(320).optional(),
})

export type CreateNetworkProductBookingResult =
  | { ok: true; reservationId: string; publicRef: string }
  | { ok: false; error: string; code?: string }

export async function createNetworkProductBooking(
  raw: z.infer<typeof bookingInputSchema>,
): Promise<CreateNetworkProductBookingResult> {
  const parsed = bookingInputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Réservation invalide : " + parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  const booking = parsed.data

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié" }
  if (!session.agencyId) return { ok: false, error: "Profil utilisateur introuvable" }
  const agencyId = session.agencyId
  const createdByUserId = session.userId

  // Marge réelle (getMarginsForAgency/applyMargin, module "network") — même
  // moteur configurable que hotel/flight/transfer, appelé AVANT la
  // transaction comme dans lib/booking/actions.ts et
  // lib/hotels-monde/guest-booking-actions.ts (jamais une deuxième formule,
  // jamais imbriqué dans la transaction de réservation).
  const networkMarginRule = (await getMarginsForAgency(agencyId, createdByUserId)).network

  try {
    return await withTenantContext(
      { agencyId, userId: createdByUserId, isSuperAdmin: session.isSuperAdmin },
      async (tx) => {
        // --- 1. Produit (RLS décide si cette agence peut le voir : propriétaire OU autorisée) ---
        const [product] = await tx
          .select()
          .from(products)
          .where(eq(products.id, booking.productId))
          .limit(1)
        if (!product) return { ok: false as const, error: "Produit introuvable ou non autorisé" }
        if (product.status !== "active") {
          return { ok: false as const, error: "Ce produit n'est plus actif.", code: "PRODUCT_NOT_ACTIVE" }
        }
        if (!product.supplierNodeId || !product.costPrice) {
          return { ok: false as const, error: "Produit Network incomplet (coût/fournisseur manquant)" }
        }

        // NETWORK-NODE-VISIBILITY-01 : `supplier_nodes` est super_admin-only
        // (RLS, 0076) et le runtime tourne sous `app_runtime` (RLS réellement
        // appliquée) — un SELECT direct ici ne voyait jamais le nœud pour une
        // agence revendeuse, d'où un échec systématique. La fonction SECURITY
        // DEFINER (0083) ne renvoie qu'un booléen, et seulement pour un
        // produit que l'agence a déjà le droit de voir.
        const nodeRows = (await tx.execute(
          sql`SELECT network_product_node_is_active(${booking.productId}::uuid) AS "isActive"`,
        )) as Array<{ isActive: boolean }>
        const nodeIsActive = nodeRows[0]?.isActive === true
        if (!nodeIsActive) {
          return { ok: false as const, error: "Le nœud fournisseur de ce produit n'est pas actif" }
        }

        // --- 2. Prix de vente = coût réel + marge (calculée avant la transaction) ---
        const costPriceTnd = Number(product.costPrice) * booking.quantity
        const totalTnd = applyMargin(costPriceTnd, networkMarginRule)

        // --- 3. Client ---
        const [customer] = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: "M",
            firstName: booking.customerFirstName,
            lastName: booking.customerLastName,
            email: booking.customerEmail || undefined,
            phone: booking.customerPhone,
          })
          .returning({ id: customers.id })
        if (!customer) throw new Error("createNetworkProductBooking: insert customer a échoué")

        // --- 4. Réservation (pending, confirmée seulement après débit) ---
        const publicRef = await nextPublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            publicRef,
            customerId: customer.id,
            module: "network",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: totalTnd.toFixed(2),
            tndAmount: totalTnd.toFixed(2),
            depositAmount: totalTnd.toFixed(2),
            depositPaid: "0",
            createdByUserId,
          })
          .returning({ id: reservations.id })
        if (!reservation) throw new Error("createNetworkProductBooking: insert reservation a échoué")
        const reservationId = reservation.id

        // --- 5. Débit crédit agence (même transaction, pas de tx imbriquée) ---
        const debitResult = await debitPartnerCredit({
          agencyId,
          amountTnd: totalTnd,
          reference: publicRef,
          description: `Réservation Network — ${product.name}`,
          createdByUserId,
          reservationId,
          idempotencyKey: `booking-debit:${reservationId}`,
          txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
        })
        if (!debitResult.ok) {
          throw new Error(debitResult.code === "INSUFFICIENT_FUNDS" ? "INSUFFICIENT_BALANCE" : "WALLET_DEBIT_FAILED")
        }

        await tx
          .update(reservations)
          .set({ status: "confirmed", confirmedAt: new Date(), depositPaid: totalTnd.toFixed(2), updatedAt: new Date() })
          .where(eq(reservations.id, reservationId))

        // --- 6. Extension Network Product ---
        await tx.insert(reservationNetworkProduct).values({
          reservationId,
          productId: booking.productId,
          supplierNodeId: product.supplierNodeId,
          quantity: booking.quantity,
        })

        // --- 7. Snapshot financier — coût RÉEL, jamais supplierPriceTnd = salePriceTnd ---
        //
        // ECON-BREAKDOWN-01 : droits économiques (economic_entitlements)
        // pour le module Network UNIQUEMENT — seul module câblé par ce
        // chantier (ECON-WIRING-01 câblera les 8 autres modules, pas encore
        // GO'd, chantier séparé).
        //
        // CURRENT ASSUMPTION — NOT ENFORCED : `costPriceTnd`/`totalTnd`
        // ci-dessus traitent `product.costPrice` comme déjà exprimé en TND,
        // sans jamais lire `product.costCurrency` (colonne nullable, sans
        // contrainte en base à 'TND' — voir `lib/db/schema.ts`). Les lignes
        // de droit ci-dessous héritent de cette même hypothèse : `amount`/
        // `currency` sont enregistrés directement en TND, parce que c'est ce
        // que fait déjà tout le reste du flux (`reservation_financials`,
        // débit wallet). AUCUN garde-fou n'est ajouté ici pour l'imposer —
        // ce serait une nouvelle règle métier ("Network = TND uniquement")
        // que ce chantier n'a pas le mandat d'inventer (décision Direction,
        // 2026-09-30 : ne pas modifier ce fichier au-delà de la construction
        // des lignes de droit). Si `product.costCurrency` différait de
        // 'TND' un jour, ces montants seraient faux sans qu'aucun code ici
        // ne le détecte. Couverture réelle du sujet devise (par module,
        // taux, arrondi, application) : futur chantier CURRENCY-DIM-01,
        // pas celui-ci.
        const marginAmountTnd = totalTnd - costPriceTnd
        // Même formule EXACTE que `recordReservationFinancials()`
        // (lib/finance/reservation-financials.ts) — dupliquée ici (une
        // soustraction + un taux, pas un second moteur de marge) uniquement
        // pour pouvoir construire la ligne "seller_margin" nette de
        // commission AVANT l'appel. Égalité prouvée par un test statique
        // (formule identique) ET par l'invariant Σ lignes = salePriceTnd
        // vérifié en base (lib/network/__tests__).
        const commissionRateForEntitlements = networkMarginRule.commissionPercent ?? 0
        const commissionAmountForEntitlements =
          Math.round(marginAmountTnd * (commissionRateForEntitlements / 100) * 100) / 100

        const { commissionAmount } = await recordReservationFinancials({
          tx,
          reservationId,
          supplierPriceTnd: costPriceTnd,
          salePriceTnd: totalTnd,
          commissionPercent: networkMarginRule.commissionPercent,
          marginRuleId: networkMarginRule.ruleId,
          // economic_entitlements — §3.1 : supplier (coût réel, aucun
          // fournisseur réel crédité au-delà de cet enregistrement, cf.
          // audit "le nœud fournisseur n'est crédité nulle part" — hors
          // scope d'y remédier ici), seller (marge nette de commission),
          // easy2book (commission — même montant que creditPlatformCommission
          // ci-dessous, qui reste le SEUL mouvement d'argent réel ; ceci
          // n'est que l'enregistrement du DROIT correspondant).
          economicEntitlements: [
            {
              partyType: "supplier_node",
              partyId: product.supplierNodeId,
              role: "supplier",
              qualification: "supplier_cost",
              amount: costPriceTnd,
              basis: "coût fournisseur réel (products.cost_price × quantité)",
              ruleId: networkMarginRule.ruleId ?? null,
              agreementId: networkMarginRule.ruleId ?? null,
            },
            {
              partyType: "agency",
              partyId: agencyId,
              role: "seller",
              qualification: "seller_margin",
              amount: marginAmountTnd - commissionAmountForEntitlements,
              basis: `marge vendeur nette de commission (${
                networkMarginRule.marginType === "percent"
                  ? `${networkMarginRule.marginValue}%`
                  : `${networkMarginRule.marginValue} TND`
              } − commission ${commissionRateForEntitlements}%)`,
              ruleId: networkMarginRule.ruleId ?? null,
              agreementId: networkMarginRule.ruleId ?? null,
            },
            {
              partyType: "easy2book",
              partyId: null,
              role: "easy2book",
              qualification: "commission",
              amount: commissionAmountForEntitlements,
              basis: `commission Easy2Book sur marge (${commissionRateForEntitlements}% × marge)`,
              ruleId: networkMarginRule.ruleId ?? null,
              agreementId: networkMarginRule.ruleId ?? null,
            },
          ],
        })

        // --- 8. Commission plateforme Easy2Book — même appel, même transaction,
        // même position que lib/booking/actions.ts et lib/booking/guest-actions.ts
        // (module Hotel) : PLATFORM-COMMISSION-NETWORK-01, gap trouvé lors de
        // l'audit commerce-readiness (le taux vient du MÊME moteur de marge
        // réel que ci-dessus, jamais un second calcul/une nouvelle table de
        // taux). No-op silencieux si commissionAmount <= 0 (géré par
        // creditPlatformCommission lui-même).
        await creditPlatformCommission(tx, {
          reservationId,
          commissionAmount,
          description: `Commission network — réservation ${publicRef}`,
        })

        return { ok: true as const, reservationId, publicRef }
      },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur interne"
    if (message === "INSUFFICIENT_BALANCE") {
      return { ok: false, error: "Solde de dépôt insuffisant pour cette réservation.", code: "INSUFFICIENT_BALANCE" }
    }
    if (message === "WALLET_DEBIT_FAILED") {
      return { ok: false, error: "Échec du débit du compte de dépôt.", code: "WALLET_DEBIT_FAILED" }
    }
    return { ok: false, error: message }
  }
}
