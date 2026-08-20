/**
 * Server Actions — Module Omra (Sprint 3A)
 *
 * createOmraBooking : réservation atomique Omra
 *   - Vérification disponibilité allotment (FOR UPDATE)
 *   - Débit wallet atomique
 *   - Insertion réservation + extension Omra
 *   - Insertion fiches pèlerins
 *   - Mise à jour allotment (retrait de stock)
 *
 * Sécurité contre le surbooking :
 *   - Transaction SQL atomique
 *   - SELECT ... FOR UPDATE sur omra_allotments
 *   - Rollback complet si erreur
 */

"use server"

import { eq, and, sql } from "drizzle-orm"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  reservations,
  reservationOmra,
  customers,
  auditEvents,
  omraPackages,
  omraAllotments,
  omraPilgrims,
  omraRoomAllocations,
  omraFlights,
  payments,
} from "@/lib/db/schema"
import { debitPartnerCredit } from "@/lib/pro/booking-actions"
import { resolveSessionContext, withTenantContext } from "@/lib/db/tenant-context"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface OmraBookingInput {
  packageId: string
  departureDate: string // YYYY-MM-DD
  pilgrims: OmraPilgrimInput[]
  // agencyId et createdByUserId résolus depuis la session serveur
}

export interface OmraPilgrimInput {
  firstName: string
  lastName: string
  firstNameAr?: string
  lastNameAr?: string
  birthDate: string // YYYY-MM-DD
  birthPlace?: string
  nationality: string // ISO 3166-1 alpha-2
  gender: "male" | "female"
  maritalStatus: "single" | "married" | "widowed" | "divorced"
  phone: string
  email?: string
  address?: string
  city?: string
  postalCode?: string
  country: string // ISO 3166-1 alpha-2
  passportNumber: string
  passportIssueDate: string // YYYY-MM-DD
  passportExpiryDate: string // YYYY-MM-DD
  passportIssuingCountry: string // ISO 3166-1 alpha-2
  bloodType?: string
  hasMedicalConditions?: boolean
  medicalConditions?: string
  requiresSpecialAssistance?: boolean
  specialAssistanceDetails?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  emergencyContactRelation?: string
  roomType?: "single" | "double" | "triple" | "quad" | "suite"
  photoUrl?: string
  passportScanUrl?: string
}

export type OmraBookingResult =
  | { ok: true; reservationId: string; publicRef: string }
  | { ok: false; error: string; code?: string }

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(
  db: DrizzleTransaction,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `OM-${year}-`
  const [row] = await db
    .select({
      maxRef: sql<string | null>`MAX(${reservations.publicRef})`,
    })
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

/* -------------------------------------------------------------------------- */
/* Main Action                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Crée une réservation Omra de manière atomique.
 *
 * Flow :
 *   1. Récupérer le package et l'allotment (FOR UPDATE)
 *   2. Vérifier disponibilité (availableCount >= pilgrims.length)
 *   3. Calculer le prix total
 *   4. Débiter le wallet (atomique)
 *   5. Insérer réservation + extension Omra
 *   6. Insérer fiches pèlerins
 *   7. Mettre à jour l'allotment (reservedCount++)
 *   8. Log audit
 *
 * Toute erreur → rollback complet.
 */
export async function createOmraBooking(
  input: OmraBookingInput,
): Promise<OmraBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const pilgrimCount = input.pilgrims.length
  if (pilgrimCount === 0) {
    return { ok: false, error: "Au moins un pèlerin est requis" }
  }

  if (pilgrimCount > 100) {
    return { ok: false, error: "Maximum 100 pèlerins par réservation" }
  }

  // Résoudre agencyId/userId via resolve_session_context() (SECURITY DEFINER)
  // — jamais depuis le client, jamais par un SELECT users direct avant que
  // le contexte RLS ne soit posé (problème de la poule et de l'œuf).
  const session = await resolveSessionContext()
  if (!session.ok) {
    return { ok: false, error: "Non authentifié" }
  }
  if (!session.agencyId) {
    return { ok: false, error: "Profil utilisateur introuvable" }
  }
  const agencyId = session.agencyId
  const createdByUserId = session.userId

  try {
    const result = await withTenantContext(
      { agencyId, userId: createdByUserId, isSuperAdmin: session.isSuperAdmin },
      async (tx) => {
      /* ------------------------------------------------------------------
       * 1. Récupérer le package (FOR UPDATE sur l'allotment)
       * ------------------------------------------------------------------ */
      const [pkg] = await tx
        .select()
        .from(omraPackages)
        .where(eq(omraPackages.id, input.packageId))
        .limit(1)

      if (!pkg) {
        throw new Error("PACKAGE_NOT_FOUND")
      }

      if (pkg.status !== "active") {
        throw new Error("PACKAGE_NOT_ACTIVE")
      }

      /* ------------------------------------------------------------------
       * 2. Récupérer l'allotment avec verrou pessimiste (FOR UPDATE)
       * ------------------------------------------------------------------ */
      const [allotment] = await tx
        .select()
        .from(omraAllotments)
        .where(
          and(
            eq(omraAllotments.packageId, input.packageId),
            eq(omraAllotments.departureDate, input.departureDate),
          ),
        )
        .limit(1)
        .for("update") // Verrou row-level pour éviter le surbooking

      if (!allotment) {
        throw new Error("ALLOTMENT_NOT_FOUND")
      }

      if (allotment.status !== "active") {
        throw new Error("ALLOTMENT_NOT_ACTIVE")
      }

      /* ------------------------------------------------------------------
       * 3. Vérifier disponibilité
       * ------------------------------------------------------------------ */
      const available = allotment.availableCount
      if (available < pilgrimCount) {
        throw new Error(`INSUFFICIENT_STOCK: ${available} places disponibles, ${pilgrimCount} demandées`)
      }

      /* ------------------------------------------------------------------
       * 4. Calculer le prix total
       * ------------------------------------------------------------------ */
      const pricePerPilgrim = allotment.overridePrice
        ? parseFloat(allotment.overridePrice)
        : parseFloat(pkg.basePrice)
      const totalTnd = pricePerPilgrim * pilgrimCount

      /* ------------------------------------------------------------------
       * 5. Créer le client (premier pèlerin comme contact principal)
       * ------------------------------------------------------------------ */
      const firstPilgrim = input.pilgrims[0]
      const [customer] = await tx
        .insert(customers)
        .values({
          agencyId,
          civility: firstPilgrim.gender === "male" ? "M" : "Mme",
          firstName: firstPilgrim.firstName,
          lastName: firstPilgrim.lastName,
          email: firstPilgrim.email,
          phone: firstPilgrim.phone,
          civicId: firstPilgrim.passportNumber,
          civicIdType: "passport",
          birthDate: firstPilgrim.birthDate,
          nationality: firstPilgrim.nationality,
        })
        .returning({ id: customers.id })

      const customerId = customer.id

      /* ------------------------------------------------------------------
       * 6. Créer la réservation
       * ------------------------------------------------------------------ */
      const publicRef = await nextPublicRef(tx, agencyId)
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
            packageId: input.packageId,
            departureDate: input.departureDate,
            pilgrimCount,
            pricePerPilgrim,
          },
        })
        .returning({ id: reservations.id, publicRef: reservations.publicRef })

      const reservationId = reservation.id

      // Débit crédit agence dans la transaction courante (txOverride) — pas de
      // tx imbriquée. Débite `agencies.deposit_balance` (le seul solde que
      // les flux de rechargement réels créditent — voir lib/booking/actions.ts
      // pour le détail de la correction).
      const debitResult = await debitPartnerCredit({
        agencyId,
        amountTnd: totalTnd,
        reference: publicRef,
        description: `Réservation Omra — ${pkg.name ?? input.packageId}`,
        createdByUserId,
        reservationId,
        idempotencyKey: `booking-debit:${reservationId}`,
        txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
      })

      if (!debitResult.ok) {
        // debitPartnerCredit gère déjà le rollback via son propre FOR UPDATE
        // Mais on throw pour rollback notre transaction
        throw new Error(debitResult.code === "INSUFFICIENT_FUNDS" ? "INSUFFICIENT_BALANCE" : "WALLET_DEBIT_FAILED")
      }

      // status=confirmed + paiement — auparavant fait par walletDebitReservation.
      await tx
        .update(reservations)
        .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
        .where(eq(reservations.id, reservationId))

      await tx.insert(payments).values({
        agencyId,
        reservationId,
        psp: "manual",
        method: "wallet",
        originalCurrency: "TND",
        originalAmount: totalTnd.toFixed(2),
        tndAmount: totalTnd.toFixed(2),
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
      })

      /* ------------------------------------------------------------------
       * 6. Insérer l'extension Omra
       * ------------------------------------------------------------------ */
      await tx.insert(reservationOmra).values({
        reservationId,
        agencyId,
        omraPackageId: input.packageId,
        departureDate: input.departureDate,
        returnDate: new Date(
          new Date(input.departureDate).getTime() + pkg.durationDays * 86_400_000,
        )
          .toISOString()
          .split("T")[0],
        pilgrims: pilgrimCount,
      })

      /* ------------------------------------------------------------------
       * 7. Insérer les fiches pèlerins
       * ------------------------------------------------------------------ */
      for (const pilgrim of input.pilgrims) {
        await tx.insert(omraPilgrims).values({
          reservationId,
          agencyId,
          firstName: pilgrim.firstName,
          lastName: pilgrim.lastName,
          firstNameAr: pilgrim.firstNameAr,
          lastNameAr: pilgrim.lastNameAr,
          birthDate: pilgrim.birthDate,
          birthPlace: pilgrim.birthPlace,
          nationality: pilgrim.nationality,
          gender: pilgrim.gender,
          maritalStatus: pilgrim.maritalStatus,
          phone: pilgrim.phone,
          email: pilgrim.email,
          address: pilgrim.address,
          city: pilgrim.city,
          postalCode: pilgrim.postalCode,
          country: pilgrim.country,
          passportNumber: pilgrim.passportNumber,
          passportIssueDate: pilgrim.passportIssueDate,
          passportExpiryDate: pilgrim.passportExpiryDate,
          passportIssuingCountry: pilgrim.passportIssuingCountry,
          bloodType: pilgrim.bloodType,
          hasMedicalConditions: pilgrim.hasMedicalConditions ?? false,
          medicalConditions: pilgrim.medicalConditions,
          requiresSpecialAssistance: pilgrim.requiresSpecialAssistance ?? false,
          specialAssistanceDetails: pilgrim.specialAssistanceDetails,
          emergencyContactName: pilgrim.emergencyContactName,
          emergencyContactPhone: pilgrim.emergencyContactPhone,
          emergencyContactRelation: pilgrim.emergencyContactRelation,
          roomType: pilgrim.roomType,
          photoUrl: pilgrim.photoUrl,
          passportScanUrl: pilgrim.passportScanUrl,
        })
      }

      /* ------------------------------------------------------------------
       * 8. Mettre à jour l'allotment (retrait de stock)
       * ------------------------------------------------------------------ */
      await tx
        .update(omraAllotments)
        .set({
          reservedCount: allotment.reservedCount + pilgrimCount,
          availableCount: allotment.availableCount - pilgrimCount,
          updatedAt: new Date(),
        })
        .where(eq(omraAllotments.id, allotment.id))

      /* ------------------------------------------------------------------
       * 9. Log audit
       * ------------------------------------------------------------------ */
      await tx.insert(auditEvents).values({
        agencyId,
        actorUserId: createdByUserId,
        entityType: "reservation",
        entityId: reservationId,
        action: "omra_booking.created",
        diff: {
          packageId: input.packageId,
          departureDate: input.departureDate,
          pilgrimCount,
          totalTnd,
          publicRef,
        },
      })

        return { reservationId, publicRef }
      },
    )

    return { ok: true, reservationId: result.reservationId, publicRef: result.publicRef }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      PACKAGE_NOT_FOUND: "Package Omra introuvable",
      PACKAGE_NOT_ACTIVE: "Ce package n'est plus actif",
      ALLOTMENT_NOT_FOUND: "Allotement introuvable pour cette date",
      ALLOTMENT_NOT_ACTIVE: "Cet allotement n'est plus actif",
      INSUFFICIENT_STOCK: (msg.match(/INSUFFICIENT_STOCK: (.+)/)?.[1] ?? "Stock insuffisant"),
      INSUFFICIENT_BALANCE: "Solde wallet insuffisant",
      WALLET_DEBIT_FAILED: "Erreur lors du débit wallet",
    }

    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return {
      ok: false,
      error: code ? codes[code] : `Erreur interne: ${msg}`,
      code: code ?? "INTERNAL_ERROR",
    }
  }
}
