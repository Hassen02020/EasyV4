"use server"

import { redirect } from "next/navigation"
import { eq, desc, and, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  customers,
  reservations,
  reservationHotel,
  auditEvents,
} from "@/lib/db/schema"
import type { BookingDraft, TravelerInput } from "./schemas"
import { bookingDraftSchema, travelerSchemaWithIdRule } from "./schemas"
import { computePriceBreakdown } from "./pricing"
import { decodeDraft } from "./draft-store"
import { walletDebitReservation } from "@/lib/wallet/actions"
import { inngest } from "@/lib/inngest/client"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { getMyGoClient, mapBookingListItemToConfirmation, type BookingConfirmationDTO } from "@/lib/mygo"
import {
  authoritativeUnitPrice,
  bookingConfirmationMatchesExpectedHotel,
  buildMyGoBookingRequest,
  classifyMyGoBookingError,
  describeMyGoBookingErrorForUser,
  extractHotelProviderMetadata,
  isAmbiguousBookingError,
  reconcileAmbiguousBooking,
  type HotelProviderMetadata,
  type MyGoBookingErrorKind,
} from "./hotel-provider-booking"

/**
 * Confirme la réservation hôtel auprès de myGo (fournisseur Tunisie) quand le
 * draft porte des métadonnées myGo valides (recherche réelle, pas une offre
 * démo). Appelé AVANT toute écriture DB / débit wallet : si myGo refuse
 * (prix/dispo changés, token expiré…), on ne crée ni réservation ni débit.
 *
 * Cas ambigu (timeout/réseau — on ne sait pas si myGo a créé la résa avant
 * que la réponse ne se perde) : tentative de réconciliation en lecture
 * seule via BookingList (documenté par myGo, pas une clé d'idempotence
 * inventée). N'adopte le résultat que s'il y a EXACTEMENT une correspondance
 * univoque ; sinon on refuse de deviner et on remonte un statut explicitement
 * "ambigu" plutôt qu'un simple échec (l'utilisateur ne doit pas être invité à
 * relancer une réservation qui a peut-être déjà été créée côté hôtel).
 */
async function confirmHotelWithProvider(
  draft: BookingDraft,
  traveler: TravelerInput,
): Promise<
  | { attempted: false }
  | {
      attempted: true
      ok: true
      booking: BookingConfirmationDTO
      providerMeta: HotelProviderMetadata
    }
  | {
      attempted: true
      ok: false
      error: string
      kind: MyGoBookingErrorKind
    }
> {
  if (draft.module !== "hotel") return { attempted: false }
  const providerMeta = extractHotelProviderMetadata(
    draft.metadata as Record<string, unknown> | undefined,
  )
  if (!providerMeta) return { attempted: false }

  try {
    const booking = await getMyGoClient().createBooking(
      buildMyGoBookingRequest({ draft, traveler, providerMeta }),
    )
    if (!bookingConfirmationMatchesExpectedHotel(booking, providerMeta)) {
      // Réponse myGo incohérente avec le contexte de recherche d'origine —
      // la résa existe peut-être bien côté fournisseur (Hotel.Id X au lieu
      // de Y attendu) : on ne peut pas l'annuler en confiance sans savoir
      // laquelle c'est vraiment, donc on remonte l'état comme ambigu plutôt
      // que de créer une réservation locale pour le mauvais hôtel.
      return {
        attempted: true,
        ok: false,
        error: describeMyGoBookingErrorForUser("AMBIGUOUS_SUPPLIER_STATE"),
        kind: "AMBIGUOUS_SUPPLIER_STATE",
      }
    }
    return { attempted: true, ok: true, booking, providerMeta }
  } catch (err) {
    const kind = classifyMyGoBookingError(err)
    if (!isAmbiguousBookingError(kind)) {
      return {
        attempted: true,
        ok: false,
        error: describeMyGoBookingErrorForUser(kind),
        kind,
      }
    }

    const reconciled = await tryReconcileAmbiguousBooking(providerMeta, draft)
    if (reconciled) {
      return { attempted: true, ok: true, booking: reconciled, providerMeta }
    }
    return {
      attempted: true,
      ok: false,
      error: describeMyGoBookingErrorForUser("AMBIGUOUS_SUPPLIER_STATE"),
      kind: "AMBIGUOUS_SUPPLIER_STATE",
    }
  }
}

/**
 * Best-effort : interroge BookingList pour retrouver une réservation créée
 * malgré une réponse perdue. Ne lève jamais — un échec de réconciliation
 * doit se traduire par "ambigu, non résolu", pas par une exception qui
 * remonterait une erreur différente à l'appelant.
 */
async function tryReconcileAmbiguousBooking(
  providerMeta: HotelProviderMetadata,
  draft: BookingDraft,
): Promise<BookingConfirmationDTO | null> {
  const hotelId = providerMeta.hotelId ?? Number(draft.offerId)
  if (!hotelId) return null
  try {
    const list = await getMyGoClient().listBookings({
      hotel: hotelId,
      fromDate: draft.startDate,
      toDate: draft.startDate,
    })
    const match = reconcileAmbiguousBooking(
      list.map((b) => ({
        bookingId: b.Id,
        hotelId: b.Hotel?.Id,
        checkIn: b.CheckIn,
        checkOut: b.CheckOut,
        state: b.State,
        createdAt: b.Created,
      })),
      { hotelId, checkIn: draft.startDate, checkOut: draft.endDate ?? draft.startDate },
      Date.now(),
    )
    if (!match) return null
    const full = list.find((b) => b.Id === match.bookingId)
    return full ? mapBookingListItemToConfirmation(full) : null
  } catch {
    return null
  }
}

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(
  db: ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TG-${year}-`
  // MAX() sur les refs du préfixe courant — atomique dans la transaction parente
  // élimine la race condition du scan-50-lignes précédent
  const [row] = await (db as ReturnType<typeof getDb>)
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

export type CreateReservationResult =
  | { ok: true; reservationId: string; publicRef: string }
  | { ok: false; error: string }

export async function createReservationFromDraft(input: {
  draft: BookingDraft
  traveler: TravelerInput
}): Promise<CreateReservationResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  // Résoudre l'agencyId depuis la session authentifiée — jamais hardcodé
  let agencyId: string
  let authUserId: string
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: "Non authentifié" }
    const profile = await getCurrentPartnerProfile(user.id)
    if (!profile) return { ok: false, error: "Profil partenaire introuvable" }
    agencyId = profile.agency.id
    authUserId = user.id
  } catch {
    return { ok: false, error: "Erreur d'authentification" }
  }

  const draftParse = bookingDraftSchema.safeParse(input.draft)
  if (!draftParse.success) {
    return {
      ok: false,
      error:
        "Brouillon invalide : " +
        draftParse.error.errors.map((e) => e.message).join(", "),
    }
  }
  const travelerParse = travelerSchemaWithIdRule.safeParse(input.traveler)
  if (!travelerParse.success) {
    return {
      ok: false,
      error:
        "Voyageur invalide : " +
        travelerParse.error.errors.map((e) => e.message).join(", "),
    }
  }

  const draft = draftParse.data
  const traveler = travelerParse.data

  // --- Confirmation fournisseur (myGo) AVANT toute écriture DB / débit wallet ---
  // Si le draft porte des métadonnées myGo (recherche hôtel réelle) et que le
  // fournisseur refuse (prix/dispo changés, token expiré…), on s'arrête ici :
  // aucune réservation ni débit wallet ne doit être créé pour une chambre
  // qu'on n'a pas réellement confirmée auprès de l'hôtel.
  const providerConfirmation = await confirmHotelWithProvider(draft, traveler)
  if (providerConfirmation.attempted && !providerConfirmation.ok) {
    return { ok: false, error: providerConfirmation.error }
  }
  const myGoBooking = providerConfirmation.attempted
    ? providerConfirmation.booking
    : null
  const providerMeta = providerConfirmation.attempted
    ? providerConfirmation.providerMeta
    : null

  // Le total myGo (quand disponible) fait foi — le brouillon est un token
  // base64url non signé, donc `draft.unitPriceTnd` n'est pas fiable à 100 %.
  const breakdown = computePriceBreakdown(
    myGoBooking
      ? {
          ...authoritativeUnitPrice(myGoBooking.totalPrice, draft.adults),
          adults: draft.adults,
          children: draft.children,
        }
      : {
          unitPriceTnd: draft.unitPriceTnd,
          adults: draft.adults,
          children: draft.children,
          unitChildPriceTnd: draft.unitChildPriceTnd,
        },
  )

  try {
    // Point d'injection de test — UNIQUEMENT actif en MYGO_MODE=virtual, pour
    // exercer le chemin de compensation réel (voir catch ci-dessous) sur le
    // scénario "myGo a confirmé, l'écriture DB locale échoue ensuite" (item 22
    // du cahier des charges Virtual MyGo). Ne fait rien en mode live.
    if (
      myGoBooking &&
      process.env.MYGO_MODE === "virtual" &&
      process.env.MYGO_SIMULATION_SCENARIO === "DB_FAILURE"
    ) {
      throw new Error("SIMULATED_DB_FAILURE: injected by virtual test harness")
    }

    const result = await withTenantContext(
      { agencyId, userId: authUserId, isSuperAdmin: false },
      async (tx) => {
      // --- Résoudre ou créer le client ---
      let customerId: string
      if (traveler.email) {
        const existing = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.agencyId, agencyId),
              eq(customers.email, traveler.email),
            ),
          )
          .limit(1)
        if (existing[0]) {
          customerId = existing[0].id
        } else {
          const inserted = await tx
            .insert(customers)
            .values({
              agencyId,
              civility: traveler.civility,
              firstName: traveler.firstName,
              lastName: traveler.lastName,
              email: traveler.email,
              phone: traveler.phone,
              civicId: traveler.civicId,
              civicIdType: traveler.civicIdType,
              birthDate: traveler.birthDate || null,
              nationality: traveler.nationality || null,
            })
            .returning({ id: customers.id })
          customerId = inserted[0].id
        }
      } else {
        const inserted = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: traveler.civility,
            firstName: traveler.firstName,
            lastName: traveler.lastName,
            phone: traveler.phone,
            civicId: traveler.civicId,
            civicIdType: traveler.civicIdType,
          })
          .returning({ id: customers.id })
        customerId = inserted[0].id
      }

      const publicRef = await nextPublicRef(tx, agencyId)

      const inserted = await tx
        .insert(reservations)
        .values({
          agencyId,
          publicRef,
          customerId,
          module: draft.module,
          source: "internal",
          status: "pending",
          originalCurrency: draft.currency,
          originalAmount: String(breakdown.totalTnd),
          tndAmount: String(breakdown.totalTnd),
          depositAmount: String(breakdown.depositTnd),
          depositPaid: "0",
          providerPayload: {
            offerId: draft.offerId,
            offerLabel: draft.offerLabel,
            startDate: draft.startDate,
            endDate: draft.endDate,
            adults: draft.adults,
            children: draft.children,
            breakdown,
            metadata: draft.metadata ?? null,
            ...(myGoBooking
              ? {
                  myGoBookingId: myGoBooking.bookingId,
                  myGoState: myGoBooking.state ?? null,
                }
              : {}),
          },
        })
        .returning({ id: reservations.id, publicRef: reservations.publicRef })
      const reservationId = inserted[0].id

      if (draft.module === "hotel") {
        const startDate = new Date(draft.startDate)
        const endDate = draft.endDate ? new Date(draft.endDate) : startDate
        const nights = Math.max(
          1,
          Math.round(
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
        const confirmedRoom = myGoBooking?.rooms[0]
        await tx.insert(reservationHotel).values({
          reservationId,
          agencyId,
          providerBookingId: myGoBooking
            ? String(myGoBooking.bookingId)
            : undefined,
          providerToken: providerMeta?.myGoToken,
          hotelId:
            myGoBooking?.hotelId ??
            providerMeta?.hotelId ??
            (Number(draft.offerId) || 0),
          hotelName: myGoBooking?.hotelName ?? draft.offerLabel,
          cityId: providerMeta?.cityId,
          checkIn: draft.startDate,
          checkOut: draft.endDate ?? draft.startDate,
          nights,
          adults: draft.adults,
          childrenAges: providerMeta?.childrenAges ?? [],
          boardCode: confirmedRoom?.boardingCode ?? providerMeta?.boardingCode,
          boardName: confirmedRoom?.boardingName,
          rooms: myGoBooking?.rooms ?? undefined,
          // 10 = solde à régler à l'hôtel (myGo AtHotel > 0) — reflète la
          // réponse fournisseur, pas une option choisie côté app (le wallet
          // couvre déjà la totalité `breakdown.totalTnd` par défaut).
          methodPayment: myGoBooking?.atHotel ? 10 : undefined,
          atHotelAmount:
            myGoBooking?.atHotel != null
              ? String(myGoBooking.atHotel)
              : undefined,
          cancellationPolicies: confirmedRoom?.cancellationPolicies ?? undefined,
        })
      }

      await tx.insert(auditEvents).values({
        agencyId,
        action: "reservation.created",
        entityType: "reservation",
        entityId: reservationId,
        diff: {
          module: draft.module,
          publicRef,
          total: breakdown.totalTnd,
          via: "front-office",
        },
      })

      // --- Débit wallet — dans la MÊME transaction (txOverride) : sans ça,
      // walletDebitReservation ouvrait sa propre transaction séparée et
      // committait le débit indépendamment de l'insertion de la réservation
      // (perte d'atomicité — trouvé pendant l'audit RLS, corrigé ici).
      const debitResult = await walletDebitReservation({
        agencyId,
        reservationId,
        amountTnd: breakdown.totalTnd,
        txOverride: tx as Parameters<typeof walletDebitReservation>[0]["txOverride"],
      })

      if (!debitResult.ok) {
        throw new Error(
          debitResult.code === "INSUFFICIENT_BALANCE"
            ? `INSUFFICIENT_BALANCE:${breakdown.totalTnd.toFixed(3)}`
            : `WALLET_ERROR:${debitResult.error}`,
        )
      }

      return { reservationId, publicRef, agencyId }
      },
    )

    // --- Événement Inngest (hors transaction, fire-and-forget) ---
    // PII sanitizé : on n'envoie que les références opaques, pas les données voyageur
    inngest.send({
      name: "booking/confirmed",
      data: {
        reservationId: result.reservationId,
        publicRef: result.publicRef,
        agencyId: result.agencyId,
        customerId: result.reservationId, // référence opaque
        module: draft.module,
        totalTnd: breakdown.totalTnd,
      },
    }).catch(() => { /* fire-and-forget — le retry Inngest suffira */ })

    return { ok: true, reservationId: result.reservationId, publicRef: result.publicRef }
  } catch (err) {
    // --- Échec APRÈS confirmation myGo (écriture DB, débit wallet insuffisant…) ---
    // À ce stade la réservation existe réellement chez le fournisseur. Sans
    // compensation on se retrouverait avec "réservation myGo confirmée MAIS
    // aucune trace/débit côté Easy2Book" — on tente donc d'annuler la résa
    // myGo pour revenir à un état cohérent des deux côtés. Best-effort :
    // si l'annulation échoue aussi, on le signale explicitement plutôt que
    // de rendre un message d'erreur générique qui masquerait le problème.
    let compensationNote = ""
    if (myGoBooking) {
      try {
        await getMyGoClient().cancelBooking({ bookingId: myGoBooking.bookingId })
      } catch {
        compensationNote =
          ` Réservation fournisseur ${myGoBooking.bookingId} potentiellement toujours active — contactez le support immédiatement avec cette référence.`
      }
    }

    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith("INSUFFICIENT_BALANCE:")) {
      const amount = msg.split(":")[1]
      return {
        ok: false,
        error: `Solde insuffisant — il vous faut ${amount} DT. Rechargez votre wallet puis réessayez.${compensationNote}`,
      }
    }
    if (msg.startsWith("WALLET_ERROR:")) {
      return { ok: false, error: (msg.split(":")[1] ?? "Erreur wallet") + compensationNote }
    }
    return {
      ok: false,
      error: "Erreur interne lors de la création de la réservation." + compensationNote,
    }
  }
}

export async function submitCheckoutAction(formData: FormData): Promise<void> {
  const token = String(formData.get("draft") ?? "")
  if (!token) {
    throw new Error("Brouillon manquant")
  }
  const payload = decodeDraft(token)
  if (!payload || !payload.traveler) {
    throw new Error("Brouillon invalide ou incomplet")
  }
  const result = await createReservationFromDraft({
    draft: payload.draft,
    traveler: payload.traveler,
  })
  if (!result.ok) {
    throw new Error(result.error)
  }
  redirect(`/booking/confirmation/${result.publicRef}`)
}
