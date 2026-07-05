/**
 * Server Action — Réservation Omra B2C (tunnel public)
 *
 * createOmraB2CBooking : réservation publique atomique, sans authentification.
 *   - Rattachée à l'agence OTA par défaut (TunisiaGo / Easy2Book B2C)
 *   - Pas de débit wallet (paiement hors-ligne : l'agence recontacte le client)
 *   - Vérification disponibilité allotment (FOR UPDATE) → anti-surbooking
 *   - Insertion réservation + extension Omra + fiches pèlerins
 *   - Décrément de stock de l'allotment
 *   - Rollback complet si erreur
 */

"use server"

import { and, eq, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import {
  reservations,
  reservationOmra,
  customers,
  omraPackages,
  omraAllotments,
  omraPilgrims,
} from "@/lib/db/schema"
import {
  B2C_DEFAULT_AGENCY_ID,
  b2cBookingSchema,
  type OmraB2CBookingInput,
  type OmraB2CBookingResult,
} from "@/lib/omra/b2c-booking-shared"

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
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

/* -------------------------------------------------------------------------- */
/* Main Action                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Crée une réservation Omra publique (B2C) de manière atomique.
 *
 * La réservation est enregistrée avec le statut `pending` (à confirmer /
 * paiement hors-ligne). L'agence Easy2Book recontacte ensuite le client.
 */
export async function createOmraB2CBooking(
  rawInput: OmraB2CBookingInput,
): Promise<OmraB2CBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const parsed = b2cBookingSchema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Données invalides",
      code: "VALIDATION_ERROR",
    }
  }

  const input = parsed.data
  const agencyId = B2C_DEFAULT_AGENCY_ID
  const pilgrimCount = input.pilgrims.length
  const db = getDb()

  try {
    const result = await db.transaction(async (tx) => {
      /* 1. Programme */
      const [pkg] = await tx
        .select()
        .from(omraPackages)
        .where(eq(omraPackages.id, input.packageId))
        .limit(1)

      if (!pkg) throw new Error("PACKAGE_NOT_FOUND")
      if (pkg.status !== "active") throw new Error("PACKAGE_NOT_ACTIVE")

      /* 2. Allotment avec verrou pessimiste (anti-surbooking) */
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
        .for("update")

      if (!allotment) throw new Error("ALLOTMENT_NOT_FOUND")
      if (allotment.status !== "active") throw new Error("ALLOTMENT_NOT_ACTIVE")

      /* 3. Disponibilité */
      if (allotment.availableCount < pilgrimCount) {
        throw new Error(
          `INSUFFICIENT_STOCK: ${allotment.availableCount} places disponibles, ${pilgrimCount} demandées`,
        )
      }

      /* 4. Prix */
      const pricePerPilgrim = allotment.overridePrice
        ? parseFloat(allotment.overridePrice)
        : parseFloat(pkg.basePrice)
      const totalTnd = pricePerPilgrim * pilgrimCount

      /* 5. Client (contact principal) */
      const [customer] = await tx
        .insert(customers)
        .values({
          agencyId,
          firstName: input.contactFirstName,
          lastName: input.contactLastName,
          email: input.contactEmail,
          phone: input.contactPhone,
          language: "fr",
        })
        .returning({ id: customers.id })

      /* 6. Réservation */
      const publicRef = await nextPublicRef(tx, agencyId)
      const [reservation] = await tx
        .insert(reservations)
        .values({
          agencyId,
          customerId: customer.id,
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
            channel: "b2c_public",
            packageId: input.packageId,
            packageSlug: pkg.slug,
            departureDate: input.departureDate,
            pilgrimCount,
            pricePerPilgrim,
            contact: {
              firstName: input.contactFirstName,
              lastName: input.contactLastName,
              email: input.contactEmail,
              phone: input.contactPhone,
            },
          },
        })
        .returning({ id: reservations.id, publicRef: reservations.publicRef })

      const reservationId = reservation.id

      /* 7. Extension Omra */
      await tx.insert(reservationOmra).values({
        reservationId,
        agencyId,
        omraPackageId: input.packageId,
        departureDate: input.departureDate,
        returnDate: new Date(
          new Date(input.departureDate).getTime() +
            pkg.durationDays * 86_400_000,
        )
          .toISOString()
          .split("T")[0],
        pilgrims: pilgrimCount,
      })

      /* 8. Fiches pèlerins */
      for (const pilgrim of input.pilgrims) {
        await tx.insert(omraPilgrims).values({
          reservationId,
          agencyId,
          firstName: pilgrim.firstName,
          lastName: pilgrim.lastName,
          birthDate: pilgrim.birthDate,
          nationality: pilgrim.nationality,
          gender: pilgrim.gender,
          maritalStatus: pilgrim.maritalStatus,
          phone: pilgrim.phone?.trim() || input.contactPhone,
          email: pilgrim.email?.trim() || input.contactEmail,
          country: pilgrim.country,
          passportNumber: pilgrim.passportNumber,
          passportIssueDate: pilgrim.passportIssueDate,
          passportExpiryDate: pilgrim.passportExpiryDate,
          passportIssuingCountry: pilgrim.passportIssuingCountry,
        })
      }

      /* 9. Décrément de stock */
      await tx
        .update(omraAllotments)
        .set({
          reservedCount: allotment.reservedCount + pilgrimCount,
          availableCount: allotment.availableCount - pilgrimCount,
          updatedAt: new Date(),
        })
        .where(eq(omraAllotments.id, allotment.id))

      return { reservationId, publicRef }
    })

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      PACKAGE_NOT_FOUND: "Programme Omra introuvable",
      PACKAGE_NOT_ACTIVE: "Ce programme n'est plus disponible",
      ALLOTMENT_NOT_FOUND: "Aucune place pour cette date de départ",
      ALLOTMENT_NOT_ACTIVE: "Cette date de départ n'est plus ouverte",
      INSUFFICIENT_STOCK:
        msg.match(/INSUFFICIENT_STOCK: (.+)/)?.[1] ?? "Stock insuffisant",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    return {
      ok: false,
      error: code ? codes[code] : `Erreur interne: ${msg}`,
      code: code ?? "INTERNAL_ERROR",
    }
  }
}
