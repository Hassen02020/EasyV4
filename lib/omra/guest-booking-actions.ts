"use server"

/**
 * Réservation Omra B2C autonome (guest checkout) — Phase 12, Partie 7.
 *
 * Blocker identifié : `createOmraBooking` (lib/omra/booking-actions.ts) est
 * un pipeline réel et transactionnellement correct (verrou FOR UPDATE sur
 * l'allotement, calcul du prix depuis la BDD), mais il exige
 * `resolveSessionContext()` (une session partenaire authentifiée) et débite
 * le wallet de dépôt de l'agence via `debitPartnerCredit` — un client final
 * anonyme ne peut jamais l'atteindre. C'est pourquoi son seul point d'entrée
 * dans l'app était `/pro/sandbox` avec des packages mockés : la page
 * publique `/omra/[id]` ne pouvait honnêtement proposer qu'un bouton
 * "contacter un conseiller" (voir son commentaire de tête).
 *
 * Ce fichier ajoute un chemin PARALLÈLE (pas une réécriture — `createOmraBooking`
 * reste intact pour le B2B) : même modèle d'identité guest checkout et même
 * séparation de règlement que `lib/booking/guest-actions.ts` (Hôtel B2C) :
 *   - `agencyId` résolu via `getDefaultAgencyId()` (agence OTA directe),
 *     jamais via une session partenaire.
 *   - Aucun débit `debitPartnerCredit` (ce ledger appartient au compte de
 *     dépôt d'une agence PARTENAIRE) : "card" → `PaymentProvider`, honnête
 *     si non configuré ; "transfer"/"cash" → réservation réelle en attente,
 *     sans capture, voucher/facture différés à la confirmation du règlement.
 *
 * Prix et disponibilité restent 100% dérivés du serveur : le verrou
 * `FOR UPDATE` sur `omra_allotments` et le calcul du prix
 * (`overridePrice` ?? `basePrice`) sont repris à l'identique de
 * `createOmraBooking` — aucun prix ni disponibilité fournis par le client
 * n'est jamais utilisé. Le stock n'est décrémenté que si la transaction va
 * jusqu'au bout (paiement carte réussi, ou règlement différé accepté) :
 * tout échec (paiement refusé, stock épuisé entre-temps) fait un ROLLBACK
 * complet, sans consommer de place.
 */

import { eq, and, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  customers,
  reservations,
  reservationOmra,
  omraPackages,
  omraAllotments,
  omraPilgrims,
  payments,
  auditEvents,
} from "@/lib/db/schema"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { sendEvent } from "@/lib/inngest/client"
import { getPaymentProvider } from "@/lib/payment/provider"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import { omraGuestBookingSchema, type OmraGuestBookingInput } from "./schemas"
import type { GuestPaymentMethod } from "@/lib/booking/guest-actions"
import { resolveLinkedAuthUserId } from "@/lib/booking/customer-identity"
import { resolveCancellationPolicy, buildPolicySnapshot } from "@/lib/booking/policy-engine"

export type CreateGuestOmraBookingResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      guestAccessToken: string
      status: "confirmed" | "pending"
    }
  | { ok: false; error: string; code?: string }

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

export async function createGuestOmraBooking(input: {
  booking: OmraGuestBookingInput
  paymentMethod: GuestPaymentMethod
}): Promise<CreateGuestOmraBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = omraGuestBookingSchema.safeParse(input.booking)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Réservation invalide : " + parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  if (!["card", "transfer", "cash"].includes(input.paymentMethod)) {
    return { ok: false, error: "Mode de paiement invalide pour une réservation en ligne." }
  }

  // Clé d'idempotence dérivée du CONTENU de la requête (package + départ +
  // passeports des pèlerins + mode de paiement), calculée côté serveur —
  // même principe que `submitCheckoutAction` (lib/booking/actions.ts) pour
  // le tunnel hôtel : un double-clic soumet deux fois le même contenu, donc
  // la même clé, et retombe sur le résultat mis en cache. Pas de valeur
  // aléatoire générée côté client (aurait produit une clé différente à
  // chaque soumission, annulant la protection anti double-réservation).
  const { createHash } = await import("node:crypto")
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        packageId: parsed.data.packageId,
        departureDate: parsed.data.departureDate,
        paymentMethod: input.paymentMethod,
        passports: parsed.data.pilgrims.map((p) => p.passportNumber),
      }),
    )
    .digest("hex")

  // PHASE "CUSTOMER RESERVATION LINK" — résolu AVANT la transaction (I/O
  // Supabase, aucune raison de le faire depuis l'intérieur d'une transaction
  // DB) : `null` pour tout visiteur non connecté ou dont l'email de session
  // ne correspond pas exactement à l'email du premier pèlerin (voir
  // lib/booking/customer-identity.ts — jamais un rattachement ambigu).
  const linkedAuthUserId = await resolveLinkedAuthUserId(parsed.data.pilgrims[0]?.email)

  return withGuestIdempotency(idempotencyKey, () =>
    runCreateGuestOmraBooking(parsed.data, input.paymentMethod, linkedAuthUserId),
  )
}

async function runCreateGuestOmraBooking(
  booking: OmraGuestBookingInput,
  paymentMethod: GuestPaymentMethod,
  linkedAuthUserId: string | null,
): Promise<CreateGuestOmraBookingResult> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return { ok: false, error: "Aucune agence de vente directe n'est configurée pour le moment." }
  }

  const pilgrimCount = booking.pilgrims.length
  const firstPilgrim = booking.pilgrims[0]

  try {
    const result = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: false },
      async (tx) => {
        // --- 1. Package + allotement (verrou FOR UPDATE, prix 100% serveur) ---
        const [pkg] = await tx
          .select()
          .from(omraPackages)
          .where(and(eq(omraPackages.id, booking.packageId), eq(omraPackages.agencyId, agencyId)))
          .limit(1)
        if (!pkg) throw new Error("PACKAGE_NOT_FOUND")
        if (pkg.status !== "published") throw new Error("PACKAGE_NOT_ACTIVE")
        if (!pkg.channels?.includes("b2c")) throw new Error("PACKAGE_NOT_ACTIVE")

        const [allotment] = await tx
          .select()
          .from(omraAllotments)
          .where(
            and(
              eq(omraAllotments.packageId, booking.packageId),
              eq(omraAllotments.departureDate, booking.departureDate),
            ),
          )
          .limit(1)
          .for("update")
        if (!allotment) throw new Error("ALLOTMENT_NOT_FOUND")
        if (allotment.status !== "active") throw new Error("ALLOTMENT_NOT_ACTIVE")
        if (allotment.availableCount < pilgrimCount) {
          throw new Error(
            `INSUFFICIENT_STOCK: ${allotment.availableCount} places disponibles, ${pilgrimCount} demandées`,
          )
        }

        const pricePerPilgrim = allotment.overridePrice
          ? parseFloat(allotment.overridePrice)
          : parseFloat(pkg.basePrice)
        const totalTnd = pricePerPilgrim * pilgrimCount

        // --- Politique d'annulation (Policy Engine Omra/Package/Activity) ---
        // Résolue et figée AU MOMENT de cette réservation précise (spécifique
        // au package > défaut agence > aucune) — voir lib/booking/policy-engine.ts.
        // Un changement de version ultérieur ne modifie jamais ce snapshot.
        const resolvedPolicy = await resolveCancellationPolicy(tx, {
          agencyId,
          productType: "omra",
          productId: booking.packageId,
        })
        const policySnapshot = buildPolicySnapshot(resolvedPolicy, booking.policyAccepted)

        // --- 2. Règlement (card = paiement réel immédiat, jamais de faux succès) ---
        if (paymentMethod === "card") {
          const provider = getPaymentProvider()
          const paymentResult = await provider.createPayment({
            amountTnd: totalTnd,
            currency: "TND",
            reference: `guest-omra-${Date.now()}`,
            description: `Réservation Omra — ${pkg.name}`,
            customerEmail: firstPilgrim.email || "",
          })
          if (!paymentResult.ok) {
            // Rollback complet : aucune place consommée, aucune réservation créée.
            throw new PaymentRejected(paymentResult.message ?? "Le paiement n'a pas pu être traité.", paymentResult.code)
          }
        }
        const isImmediatelyPaid = paymentMethod === "card"

        // --- 3. Client (premier pèlerin = contact principal) ---
        const [customer] = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: firstPilgrim.gender === "male" ? "M" : "Mme",
            firstName: firstPilgrim.firstName,
            lastName: firstPilgrim.lastName,
            email: firstPilgrim.email || undefined,
            phone: firstPilgrim.phone,
            civicId: firstPilgrim.passportNumber,
            civicIdType: "passport",
            birthDate: firstPilgrim.birthDate,
            nationality: firstPilgrim.nationality,
            // PHASE "CUSTOMER RESERVATION LINK" — nouvelle ligne dans tous
            // les cas (ce module ne réutilise jamais un customer existant),
            // donc aucun risque de réattribuer une ligne préexistante :
            // `null` pour tout visiteur non connecté (comportement guest
            // inchangé), voir lib/booking/customer-identity.ts.
            authUserId: linkedAuthUserId ?? undefined,
          })
          .returning({ id: customers.id })
        const customerId = customer.id

        // --- 4. Réservation ---
        const publicRef = await nextOmraPublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            customerId,
            publicRef,
            module: "omra",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: String(totalTnd),
            tndAmount: String(totalTnd),
            depositAmount: String(totalTnd),
            depositPaid: "0",
            providerPayload: {
              packageId: booking.packageId,
              departureDate: booking.departureDate,
              pilgrimCount,
              pricePerPilgrim,
              offerLabel: pkg.name,
              startDate: booking.departureDate,
              adults: pilgrimCount,
              children: 0,
              channel: "b2c_guest",
              paymentMethod,
              policySnapshot,
            },
          })
          .returning({ id: reservations.id, guestAccessToken: reservations.guestAccessToken })
        const reservationId = reservation.id
        const guestAccessToken = reservation.guestAccessToken

        if (isImmediatelyPaid) {
          await tx
            .update(reservations)
            .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
            .where(eq(reservations.id, reservationId))
        }

        await tx.insert(payments).values({
          agencyId,
          reservationId,
          psp: "manual",
          method: paymentMethod,
          originalCurrency: "TND",
          originalAmount: totalTnd.toFixed(2),
          tndAmount: totalTnd.toFixed(2),
          kind: "deposit",
          status: isImmediatelyPaid ? "captured" : "pending",
          capturedAt: isImmediatelyPaid ? new Date() : undefined,
        })

        // --- 5. Extension Omra + fiches pèlerins ---
        const returnDate = new Date(
          new Date(booking.departureDate).getTime() + pkg.durationDays * 86_400_000,
        )
          .toISOString()
          .split("T")[0]

        await tx.insert(reservationOmra).values({
          reservationId,
          agencyId,
          omraPackageId: booking.packageId,
          departureDate: booking.departureDate,
          returnDate,
          pilgrims: pilgrimCount,
        })

        for (const pilgrim of booking.pilgrims) {
          await tx.insert(omraPilgrims).values({
            reservationId,
            agencyId,
            firstName: pilgrim.firstName,
            lastName: pilgrim.lastName,
            firstNameAr: pilgrim.firstNameAr || undefined,
            lastNameAr: pilgrim.lastNameAr || undefined,
            birthDate: pilgrim.birthDate,
            birthPlace: pilgrim.birthPlace || undefined,
            nationality: pilgrim.nationality,
            gender: pilgrim.gender,
            maritalStatus: pilgrim.maritalStatus,
            phone: pilgrim.phone,
            email: pilgrim.email || undefined,
            address: pilgrim.address || undefined,
            city: pilgrim.city || undefined,
            postalCode: pilgrim.postalCode || undefined,
            country: pilgrim.country,
            passportNumber: pilgrim.passportNumber,
            passportIssueDate: pilgrim.passportIssueDate,
            passportExpiryDate: pilgrim.passportExpiryDate,
            passportIssuingCountry: pilgrim.passportIssuingCountry,
            bloodType: pilgrim.bloodType || undefined,
            hasMedicalConditions: pilgrim.hasMedicalConditions,
            medicalConditions: pilgrim.medicalConditions || undefined,
            requiresSpecialAssistance: pilgrim.requiresSpecialAssistance,
            specialAssistanceDetails: pilgrim.specialAssistanceDetails || undefined,
            emergencyContactName: pilgrim.emergencyContactName || undefined,
            emergencyContactPhone: pilgrim.emergencyContactPhone || undefined,
            emergencyContactRelation: pilgrim.emergencyContactRelation || undefined,
            roomType: pilgrim.roomType,
          })
        }

        // --- 6. Décrément du stock (seulement si on arrive jusqu'ici) ---
        await tx
          .update(omraAllotments)
          .set({
            reservedCount: allotment.reservedCount + pilgrimCount,
            availableCount: allotment.availableCount - pilgrimCount,
            updatedAt: new Date(),
          })
          .where(eq(omraAllotments.id, allotment.id))

        await tx.insert(auditEvents).values({
          agencyId,
          entityType: "reservation",
          entityId: reservationId,
          action: "omra_booking.created",
          diff: { packageId: booking.packageId, departureDate: booking.departureDate, pilgrimCount, totalTnd, publicRef, via: "b2c_guest", paymentMethod },
        })

        return {
          reservationId,
          publicRef,
          guestAccessToken,
          status: (isImmediatelyPaid ? "confirmed" : "pending") as "confirmed" | "pending",
          packageName: pkg.name,
          totalTnd,
          contactEmail: firstPilgrim.email,
          contactName: `${firstPilgrim.firstName} ${firstPilgrim.lastName}`.trim(),
        }
      },
    )

    if (result.contactEmail) {
      await sendEvent("booking/omra.confirmed", {
        reservationId: result.reservationId,
        publicRef: result.publicRef,
        agencyId,
        packageName: result.packageName,
        pilgrimsCount: pilgrimCount,
        departureDate: booking.departureDate,
        totalTnd: result.totalTnd,
        contactEmail: result.contactEmail,
      }).catch(() => { /* fire-and-forget */ })
    }

    if (result.status === "confirmed") {
      try {
        const invoiceResult = await generateInvoiceForReservation({
          agencyId,
          reservationId: result.reservationId,
          actorUserId: "",
        })
        if (!invoiceResult.ok) {
          console.error("[omra-guest] génération facture échouée", invoiceResult.error)
        }
      } catch (err) {
        console.error("[omra-guest] génération facture échouée", err instanceof Error ? err.message : String(err))
      }
    }

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      guestAccessToken: result.guestAccessToken,
      status: result.status,
    }
  } catch (err) {
    if (err instanceof PaymentRejected) {
      return { ok: false, error: err.message, code: err.code }
    }
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      PACKAGE_NOT_FOUND: "Package Omra introuvable",
      PACKAGE_NOT_ACTIVE: "Ce package n'est plus actif",
      ALLOTMENT_NOT_FOUND: "Aucun départ correspondant à cette date",
      ALLOTMENT_NOT_ACTIVE: "Ce départ n'est plus ouvert à la réservation",
      INSUFFICIENT_STOCK: msg.match(/INSUFFICIENT_STOCK: (.+)/)?.[1] ?? "Stock insuffisant",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return { ok: false, error: code ? codes[code] : "Erreur interne lors de la création de la réservation.", code: code ?? "INTERNAL_ERROR" }
  }
}

/** Erreur typée pour distinguer un refus de paiement d'une erreur interne générique. */
class PaymentRejected extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.code = code
  }
}

async function nextOmraPublicRef(
  tx: DrizzleTransaction,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `OM-${year}-`
  const [row] = await tx
    .select({ maxRef: sql<string | null>`MAX(${reservations.publicRef})` })
    .from(reservations)
    .where(
      and(
        eq(reservations.agencyId, agencyId),
        sql`${reservations.publicRef} LIKE ${prefix + "%"}`,
      ),
    )
  const maxRef = row?.maxRef
  const max = maxRef ? Number(maxRef.slice(prefix.length)) : 0
  return `${prefix}${pad(Number.isFinite(max) ? max + 1 : 1)}`
}
