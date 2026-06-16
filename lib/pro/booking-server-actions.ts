/**
 * Server Actions B2B exposées aux Client Components.
 *
 * Ce fichier porte la directive `"use server"` au niveau module : il ne
 * peut donc exporter que des fonctions asynchrones (Server Actions). Toute
 * la logique métier (validation Zod, transaction Drizzle, débit pessimiste)
 * vit dans `./booking-actions` (module serveur classique). On isole ici la
 * frontière client↔serveur pour que `booking-travelers-form` (Client
 * Component) puisse appeler `bookHotelB2B` sans embarquer les dépendances
 * serveur (postgres, next/headers) dans le bundle navigateur.
 */

"use server"

import { getDb } from "@/lib/db/client"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"

import {
  B2BDebitFailure,
  bookHotelB2BSchema,
  runB2BHotelReservation,
  type BookHotelB2BInput,
  type BookHotelB2BResult,
} from "./booking-actions"

/**
 * Server Action — validation finale du tunnel de réservation hôtelière B2B.
 *
 * Orchestration atomique (une seule transaction Drizzle) :
 *   a) Validation Zod du panier + voyageur.
 *   b) Insertion de la réservation (`reservations` + `reservation_hotel`).
 *   c) Débit du compte de dépôt via le verrou pessimiste
 *      (`INSUFFICIENT_FUNDS` / `AGENCY_NOT_FOUND` gérés).
 *
 * En cas d'échec du débit, la réservation n'est jamais créée (ROLLBACK).
 * L'utilisateur est résolu via la session Supabase et injecté dans
 * `createdByUserId` (sécurité — jamais fourni par le client).
 */
export async function bookHotelB2B(
  input: BookHotelB2BInput,
): Promise<BookHotelB2BResult> {
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      code: "DATABASE_NOT_CONFIGURED",
      error: "La base de données n'est pas configurée.",
    }
  }

  // Sécurité : résoudre l'utilisateur + l'agence depuis la session Supabase.
  let agencyId: string
  let userId: string
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return {
        ok: false,
        code: "NOT_AUTHENTICATED",
        error: "Vous devez être connecté pour valider une réservation.",
      }
    }
    const profile = await getCurrentPartnerProfile(user.id)
    if (!profile) {
      return {
        ok: false,
        code: "PROFILE_NOT_FOUND",
        error: "Profil partenaire introuvable pour cet utilisateur.",
      }
    }
    agencyId = profile.agency.id
    userId = user.id
  } catch {
    return {
      ok: false,
      code: "NOT_AUTHENTICATED",
      error: "Erreur d'authentification.",
    }
  }

  // a) Validation Zod (défense en profondeur).
  const parsed = bookHotelB2BSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      error:
        "Panier invalide : " +
        parsed.error.errors.map((e) => e.message).join(", "),
    }
  }

  try {
    const db = getDb()
    const result = await db.transaction(async (tx) =>
      runB2BHotelReservation(tx, { agencyId, userId, input: parsed.data }),
    )
    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      balanceAfter: result.balanceAfter,
    }
  } catch (err) {
    if (err instanceof B2BDebitFailure) {
      return { ok: false, code: err.code, error: err.message }
    }
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error:
        err instanceof Error
          ? `Échec de la réservation : ${err.message}`
          : "Échec de la réservation.",
    }
  }
}
