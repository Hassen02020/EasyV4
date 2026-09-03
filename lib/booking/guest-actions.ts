"use server"

/**
 * Réservation B2C autonome (guest checkout) — Phase 12.
 *
 * Blocker identifié en Phase 11 : `createReservationFromDraft` (le seul
 * pipeline de réservation réel avec wallet+facture) résout toujours
 * `agencyId` via `getCurrentPartnerProfile(user.id)` — un visiteur anonyme
 * ne peut jamais l'atteindre avec succès. Cette fonction est un chemin
 * PARALLÈLE, pas une réécriture de `createReservationFromDraft` (qui reste
 * intact, correctifs P0 Phase 11 inclus, toujours utilisée par le tunnel
 * B2B) — modèle d'identité choisi : **guest checkout** (Option A de la
 * mission), pas de deuxième système utilisateur :
 *   - Le client reste une ligne `customers` ordinaire, comme en B2B.
 *   - L'agence "propriétaire" de la réservation est l'agence OTA directe
 *     (`getDefaultAgencyId()`, `agency_type='ota'`) — même helper déjà
 *     utilisé par les vitrines publiques Transferts/Car (Phase 9-10), pas
 *     un nouveau concept.
 *   - Aucun compte Supabase Auth n'est créé PAR cette fonction — un client
 *     peut réserver sans jamais s'authentifier (comportement inchangé). Si
 *     une session Supabase existe déjà (compte B2C, voir app/compte/**) et
 *     que son email vérifié correspond exactement à l'email voyageur saisi,
 *     `customers.authUserId` est renseigné pour permettre l'historique
 *     (voir lib/booking/customer-identity.ts) — jamais l'inverse.
 *
 * Règlement (voir lib/payment/provider.ts) : contrairement au B2B, un
 * booking B2C n'est JAMAIS réglé via `debitPartnerCredit` (ce ledger
 * appartient au compte de dépôt d'une agence PARTENAIRE, pas à un client
 * final) :
 *   - "card" (paiement en ligne immédiat) → `PaymentProvider.createPayment()`.
 *     Si non configuré : erreur explicite `PAYMENT_PROVIDER_NOT_CONFIGURED`,
 *     AUCUNE réservation n'est créée. Jamais de faux succès.
 *   - "transfer"/"cash" (règlement différé/manuel — déjà annoncé comme tel
 *     dans l'UI existante, `components/booking/checkout-form.tsx`) → la
 *     réservation est créée réellement, `status: "pending"`, sans capture
 *     de paiement ; le voucher (Phase 11 : confirmed/completed uniquement)
 *     et la facture ne sont émis qu'une fois le règlement confirmé.
 *
 * La revalidation prix reste strictement identique au chemin B2B : appel
 * myGo réel (`confirmHotelWithProvider`, réutilisé tel quel) AVANT tout
 * calcul de prix — un draft sans confirmation fournisseur valide est
 * systématiquement rejeté (même garde P0 que Phase 11), quel que soit le
 * mode de paiement choisi.
 */

import { eq, and } from "drizzle-orm"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  reservations,
  reservationHotel,
  payments,
  auditEvents,
} from "@/lib/db/schema"
import type { BookingDraft, TravelerInput } from "./schemas"
import { bookingDraftSchema, travelerSchemaWithIdRule, paymentMethodSchema } from "./schemas"
import { computePriceBreakdown } from "./pricing"
import { confirmHotelWithProvider, nextPublicRef } from "./actions"
import { authoritativeUnitPrice } from "./hotel-provider-booking"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { getMarginsForAgency } from "@/lib/pro/server-context"
import { applyMargin } from "@/lib/pro/pricing"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { debitCustomerWallet } from "@/lib/finance/customer-wallet"
import { getMyGoClient } from "@/lib/mygo"
import { resolveMyGoAccessForTenant, type ResolvedMyGoAccess } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { sendEvent } from "@/lib/inngest/client"
import { getPaymentProvider } from "@/lib/payment/provider"
import { attemptCardPayment, generateGuestPaymentReference } from "./guest-card-payment"
import { withGuestIdempotency } from "./guest-idempotency"
import { pgErrorCode } from "@/lib/db/pg-error"
import { resolveLinkedAuthUserId, resolveOrCreateLinkedCustomer } from "./customer-identity"
import { getReservationPaymentSummary } from "@/lib/finance/payment-summary"
import { earnPendingPoints } from "@/lib/loyalty/rewards-core"

export type GuestPaymentMethod = "card" | "wallet" | "transfer" | "cash" | "at_hotel"

/** Délai de règlement manuel (cash/virement) avant expiration automatique — Wallet/Payment Core. */
const MANUAL_PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1000

/** Marqueur interne pour distinguer un échec de débit wallet (attendu, pas
 * une erreur système) d'une vraie erreur DB dans le `catch` englobant. */
class WalletDebitFailedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "WalletDebitFailedError"
  }
}

export type CreateGuestReservationResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      guestAccessToken: string
      status: "confirmed" | "pending"
    }
  | { ok: false; error: string; code?: string }

export async function createGuestReservationFromDraft(input: {
  draft: BookingDraft
  traveler: TravelerInput
  paymentMethod: GuestPaymentMethod
  /** Clé d'idempotence stable pour cette soumission précise (voir appelant). */
  idempotencyKey: string
}): Promise<CreateGuestReservationResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const draftParse = bookingDraftSchema.safeParse(input.draft)
  if (!draftParse.success) {
    return {
      ok: false,
      error: "Brouillon invalide : " + draftParse.error.errors.map((e) => e.message).join(", "),
    }
  }
  const travelerParse = travelerSchemaWithIdRule.safeParse(input.traveler)
  if (!travelerParse.success) {
    return {
      ok: false,
      error: "Voyageur invalide : " + travelerParse.error.errors.map((e) => e.message).join(", "),
    }
  }
  const methodParse = paymentMethodSchema.safeParse(input.paymentMethod)
  if (!methodParse.success) {
    return { ok: false, error: "Mode de paiement invalide pour une réservation en ligne." }
  }

  // PHASE "CUSTOMER RESERVATION LINK" — résolu AVANT la transaction (I/O
  // Supabase). `null` pour tout visiteur non connecté, ou dont l'email de
  // session ne correspond pas exactement à l'email voyageur saisi — voir
  // lib/booking/customer-identity.ts (jamais un rattachement ambigu).
  const linkedAuthUserId = await resolveLinkedAuthUserId(travelerParse.data.email)

  return withGuestIdempotency(input.idempotencyKey, () =>
    runCreateGuestReservation(
      draftParse.data,
      travelerParse.data,
      methodParse.data as GuestPaymentMethod,
      input.idempotencyKey,
      linkedAuthUserId,
    ),
  )
}

/**
 * Backstop DB (Phase 20) — retrouve une réservation guest déjà créée pour
 * cette clé d'idempotence exacte (même token de brouillon + même méthode
 * de paiement), sans jamais réattaquer myGo/le paiement. `null` = aucune
 * réservation existante pour cette clé, l'appelant peut procéder.
 */
async function findReservationByGuestIdempotencyKey(
  agencyId: string,
  idempotencyKey: string,
): Promise<CreateGuestReservationResult | null> {
  const rows = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    tx
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
        status: reservations.status,
      })
      .from(reservations)
      .where(and(eq(reservations.agencyId, agencyId), eq(reservations.guestIdempotencyKey, idempotencyKey)))
      .limit(1),
  )
  const row = rows[0]
  if (!row) return null
  return {
    ok: true,
    reservationId: row.id,
    publicRef: row.publicRef,
    guestAccessToken: row.guestAccessToken,
    status: row.status === "confirmed" ? "confirmed" : "pending",
  }
}

async function runCreateGuestReservation(
  draft: BookingDraft,
  traveler: TravelerInput,
  paymentMethod: GuestPaymentMethod,
  idempotencyKey: string,
  linkedAuthUserId: string | null,
): Promise<CreateGuestReservationResult> {
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return { ok: false, error: "Aucune agence de vente directe n'est configurée pour le moment." }
  }
  // PHASE 27.2 — compte fournisseur myGo de L'AGENCE OTA DIRECTE (jamais le
  // client global `MYGO_*` tant qu'un compte tenant est configuré pour
  // elle). Même sémantique tenant que `guestTenantContext()`
  // (isSuperAdmin: true reflète uniquement l'absence de session guest, pas
  // un accès élargi — voir lib/hotel-suppliers/tenant/live-resolution.ts) ;
  // reconstruit ici directement plutôt que de rappeler `guestTenantContext()`
  // pour éviter une seconde résolution de `agencyId` déjà connu ci-dessus.
  // Résolu UNE SEULE FOIS, réutilisé pour BOOK, la réconciliation ambiguë ET
  // toutes les compensations (annulation) plus bas.
  const myGoAccess: ResolvedMyGoAccess = await resolveMyGoAccessForTenant({
    agencyId,
    userId: "",
    isSuperAdmin: true,
  })

  // --- Backstop DB idempotence (Phase 20) — indépendant de Redis ---
  // Un retry après timeout (ou un appel alors que Redis est indisponible)
  // retrouve directement la réservation déjà créée, AVANT tout appel
  // fournisseur (myGo) ou tentative de paiement — jamais un second hold
  // myGo ni un second débit pour la même soumission.
  const existingByKey = await findReservationByGuestIdempotencyKey(agencyId, idempotencyKey)
  if (existingByKey) return existingByKey

  // --- Revalidation fournisseur RÉELLE (myGo) — jamais de prix client-fourni ---
  // Même garde que le correctif P0 Phase 11 (lib/booking/actions.ts) : sans
  // confirmation fournisseur valide, aucun prix n'est jamais calculé ni
  // débité, quel que soit le module ou le mode de paiement.
  const providerConfirmation = await confirmHotelWithProvider(draft, traveler, myGoAccess)
  if (providerConfirmation.attempted && !providerConfirmation.ok) {
    return { ok: false, error: providerConfirmation.error }
  }
  const myGoBooking = providerConfirmation.attempted ? providerConfirmation.booking : null
  const providerMeta = providerConfirmation.attempted ? providerConfirmation.providerMeta : null
  if (!myGoBooking) {
    return {
      ok: false,
      error:
        "Cette réservation ne peut pas être confirmée : aucun prix vérifié par le fournisseur n'est disponible pour cette offre.",
    }
  }

  // Marge OTA appliquée exactement comme pour toute agence (même mécanisme
  // que le B2B, `applyMargin`/`getMarginsForAgency` — pas une deuxième
  // formule) : le client final paie le prix affiché par Easy2Book, jamais
  // le prix net fournisseur brut.
  const agencyPrice = applyMargin(
    myGoBooking.totalPrice,
    (await getMarginsForAgency(agencyId, "")).hotel,
  )
  const breakdown = computePriceBreakdown({
    ...authoritativeUnitPrice(agencyPrice, draft.adults),
    adults: draft.adults,
    children: draft.children,
  })

  const hotelStartDate = new Date(draft.startDate)
  const hotelEndDate = draft.endDate ? new Date(draft.endDate) : hotelStartDate
  const hotelNights = Math.max(
    1,
    Math.round((hotelEndDate.getTime() - hotelStartDate.getTime()) / (1000 * 60 * 60 * 24)),
  )

  // --- Paiement en ligne immédiat ---
  // Tenté AVANT toute écriture DB : si le paiement échoue OU si le provider
  // lève une exception (timeout réseau, etc. — voir
  // lib/booking/guest-card-payment.ts, correctif Phase 15), aucune
  // réservation locale n'est créée — et la réservation fournisseur (déjà
  // confirmée chez myGo à ce stade) est annulée en compensation, même
  // logique que le catch de createReservationFromDraft.
  if (paymentMethod === "card") {
    const paymentResult = await attemptCardPayment(
      getPaymentProvider(),
      {
        amountTnd: breakdown.totalTnd,
        currency: "TND",
        reference: generateGuestPaymentReference(),
        description: `Réservation ${draft.module} — ${draft.offerLabel}`,
        customerEmail: traveler.email,
      },
      // PHASE 27.2 — même compte tenant que celui qui a créé le hold.
      () => (myGoAccess.client ?? getMyGoClient()).cancelBooking({ bookingId: myGoBooking.bookingId }),
    )
    if (!paymentResult.ok) {
      return {
        ok: false,
        error: paymentResult.message ?? "Le paiement n'a pas pu être traité.",
        code: paymentResult.code,
      }
    }
    // Un vrai provider confirmerait ici avant de continuer — aucun
    // adaptateur réel n'existe encore (voir lib/payment/provider.ts), donc
    // cette branche n'est aujourd'hui jamais atteinte en pratique.
  }

  // "wallet" ne peut être tranché qu'APRÈS avoir résolu customerId (donc à
  // l'intérieur de la transaction, une fois la ligne `customers` posée) —
  // "card" reste tranché avant, car c'est un appel externe (PSP) qui ne
  // dépend d'aucune ligne DB. isImmediatelyPaid n'est donc définitif qu'en
  // sortie de transaction.
  const isImmediatelyPaidByCard = paymentMethod === "card"

  try {
    const result = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: false },
      async (tx) => {
        // PHASE "CUSTOMER RESERVATION LINK" — find-or-create + rattachement
        // `authUserId` sûr, logique UNIQUE partagée avec le module Omra/
        // Package/Activité (voir lib/booking/customer-identity.ts).
        const customerId = await resolveOrCreateLinkedCustomer(tx, {
          agencyId,
          traveler,
          linkedAuthUserId,
        })

        const publicRef = await nextPublicRef(tx, agencyId)

        // Fenêtre de règlement manuel 24h — posée uniquement pour ce qui
        // reste réellement `pending` en sortie de transaction (transfer/
        // cash, ou wallet en cas de solde insuffisant ne serait de toute
        // façon jamais atteint ici : voir le débit ci-dessous, qui fait
        // échouer toute la transaction avant ce point). `card` : jamais de
        // fenêtre, soit confirmé immédiatement soit rejeté avant tout INSERT.
        // `at_hotel` : pas de fenêtre non plus — contrairement à
        // transfer/cash (réglés en principe sous 24h), le règlement à
        // l'hôtel n'a lieu qu'au check-in, potentiellement des semaines
        // plus tard ; poser une expiration de 24h annulerait la réservation
        // avant même le séjour. La réservation reste `pending` (jamais
        // auto-expirée par le cron, qui ne cible que les lignes avec un
        // paymentExpiresAt non nul) jusqu'à un règlement manuel constaté par
        // le staff (verifyManualPayment, method déjà supporté) ou une
        // annulation manuelle explicite.
        const paymentExpiresAt =
          paymentMethod === "transfer" || paymentMethod === "cash"
            ? new Date(Date.now() + MANUAL_PAYMENT_WINDOW_MS)
            : null

        let inserted: { id: string; publicRef: string; guestAccessToken: string }[]
        try {
          // Savepoint (transaction imbriquée) : si l'INSERT échoue sur le
          // conflit d'unicité, seul ce sous-bloc est annulé. Sans savepoint,
          // Postgres marque toute la transaction externe `tx` "aborted" dès
          // la première erreur — même en capturant l'exception ici, le COMMIT
          // final de `tx` échouerait quand même avec la même erreur brute.
          inserted = await tx.transaction((tx2) =>
            tx2
              .insert(reservations)
              .values({
                agencyId,
                publicRef,
                customerId,
                module: "hotel",
                source: "internal",
                status: "pending",
                originalCurrency: draft.currency,
                originalAmount: String(breakdown.totalTnd),
                tndAmount: String(breakdown.totalTnd),
                depositAmount: String(breakdown.depositTnd),
                depositPaid: "0",
                paymentExpiresAt: paymentExpiresAt ?? undefined,
                guestIdempotencyKey: idempotencyKey,
                providerPayload: {
                  offerId: draft.offerId,
                  offerLabel: draft.offerLabel,
                  startDate: draft.startDate,
                  endDate: draft.endDate,
                  adults: draft.adults,
                  children: draft.children,
                  breakdown,
                  metadata: draft.metadata ?? null,
                  channel: "b2c_guest",
                  paymentMethod,
                  myGoBookingId: myGoBooking.bookingId,
                  myGoState: myGoBooking.state ?? null,
                },
              })
              .returning({
                id: reservations.id,
                publicRef: reservations.publicRef,
                guestAccessToken: reservations.guestAccessToken,
              }),
          )
        } catch (err) {
          // Double-submit vraiment simultané : l'autre requête a gagné la
          // course sur reservations_guest_idempotency_uniq. Rien d'autre
          // n'a encore été écrit pour CETTE tentative (pas de wallet debit,
          // pas de reservation_hotel) — on s'arrête ici, le hold myGo de
          // cette tentative perdante sera compensé par l'appelant.
          if (pgErrorCode(err) === "23505") {
            return { conflict: true as const }
          }
          throw err
        }
        const reservationId = inserted[0].id
        const guestAccessToken = inserted[0].guestAccessToken

        const confirmedRoom = myGoBooking.rooms[0]
        await tx.insert(reservationHotel).values({
          reservationId,
          agencyId,
          providerBookingId: String(myGoBooking.bookingId),
          providerToken: providerMeta?.myGoToken,
          hotelId: myGoBooking.hotelId ?? providerMeta?.hotelId ?? (Number(draft.offerId) || 0),
          hotelName: myGoBooking.hotelName ?? draft.offerLabel,
          cityId: providerMeta?.cityId,
          checkIn: draft.startDate,
          checkOut: draft.endDate ?? draft.startDate,
          nights: hotelNights,
          adults: draft.adults,
          childrenAges: providerMeta?.childrenAges ?? [],
          boardCode: confirmedRoom?.boardingCode ?? providerMeta?.boardingCode,
          boardName: confirmedRoom?.boardingName,
          rooms: myGoBooking.rooms,
          methodPayment: myGoBooking.atHotel ? 10 : undefined,
          atHotelAmount: myGoBooking.atHotel != null ? String(myGoBooking.atHotel) : undefined,
          cancellationPolicies: confirmedRoom?.cancellationPolicies ?? undefined,
        })

        await tx.insert(auditEvents).values({
          agencyId,
          entityType: "reservation",
          entityId: reservationId,
          action: "reservation.created",
          diff: { module: draft.module, publicRef, total: breakdown.totalTnd, via: "b2c_guest", paymentMethod },
        })

        let isImmediatelyPaid = isImmediatelyPaidByCard

        if (paymentMethod === "wallet") {
          // Débit AVANT toute confirmation — dans la MÊME transaction que
          // la création de la réservation (txOverride), pour l'atomicité
          // déjà établie par debitPartnerCredit côté B2B : un solde
          // insuffisant doit annuler la réservation entière (ROLLBACK),
          // jamais laisser une réservation `pending` orpheline d'un débit
          // qui n'a pas eu lieu. Solde serveur-autoritaire uniquement — le
          // montant vient de `breakdown.totalTnd` (calculé plus haut à
          // partir du prix myGo réel + marge), jamais d'une valeur client.
          const debit = await debitCustomerWallet({
            customerId,
            amountTnd: breakdown.totalTnd,
            reservationId,
            description: `Réservation ${draft.module} — ${draft.offerLabel}`,
            txOverride: tx as Parameters<typeof debitCustomerWallet>[0]["txOverride"],
          })
          if (!debit.ok) {
            throw new WalletDebitFailedError(debit.code, debit.message)
          }
          isImmediatelyPaid = true
        }

        if (isImmediatelyPaid) {
          await tx
            .update(reservations)
            .set({ status: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
            .where(eq(reservations.id, reservationId))

          await tx.insert(payments).values({
            agencyId,
            reservationId,
            psp: "manual",
            method: paymentMethod === "wallet" ? "wallet" : "card",
            originalCurrency: "TND",
            originalAmount: breakdown.totalTnd.toFixed(2),
            tndAmount: breakdown.totalTnd.toFixed(2),
            kind: "deposit",
            status: "captured",
            capturedAt: new Date(),
          })

          // Easy2Book Rewards (Phase 38D) — montant éligible = paiement
          // réellement capturé (lib/finance/payment-summary.ts), jamais
          // breakdown.totalTnd (prix calculé, pas encaissé). Même
          // transaction que la confirmation : jamais un point sans
          // réservation confirmée derrière.
          const rewardsSummary = await getReservationPaymentSummary({
            reservationId,
            txOverride: tx as Parameters<typeof getReservationPaymentSummary>[0]["txOverride"],
          })
          await earnPendingPoints(tx, {
            agencyId,
            customerId,
            reservationId,
            module: "hotel",
            eligibleTnd: rewardsSummary.collectedTnd,
            idempotencyKey: `earn-pending:${reservationId}`,
          })
        } else {
          // Règlement différé (virement/espèces) — déjà annoncé comme tel
          // dans l'UI existante. Réservation réelle, statut `pending` :
          // aucun voucher (Phase 11 : confirmed/completed uniquement),
          // aucune facture tant que le règlement n'est pas confirmé
          // manuellement par un opérateur (voir
          // lib/finance/manual-payment-actions.ts). `paymentExpiresAt`
          // (posé ci-dessus) déclenche l'expiration automatique 24h.
          await tx.insert(payments).values({
            agencyId,
            reservationId,
            psp: "manual",
            method: paymentMethod,
            originalCurrency: "TND",
            originalAmount: breakdown.totalTnd.toFixed(2),
            tndAmount: breakdown.totalTnd.toFixed(2),
            kind: "deposit",
            status: "pending",
          })
        }

        const finalStatus: "confirmed" | "pending" = isImmediatelyPaid ? "confirmed" : "pending"
        return {
          reservationId,
          publicRef,
          guestAccessToken,
          status: finalStatus,
          isImmediatelyPaid,
          conflict: false as const,
        }
      },
    )

    if (result.conflict) {
      // Cette tentative a perdu la course sur reservations_guest_idempotency_uniq
      // — l'autre requête (même token+méthode) a déjà créé la réservation
      // réelle. Compense le hold myGo redondant de CETTE tentative (best
      // effort, même logique que le catch général plus bas) puis renvoie le
      // résultat de la réservation gagnante, jamais une erreur générique.
      try {
        await (myGoAccess.client ?? getMyGoClient()).cancelBooking({ bookingId: myGoBooking.bookingId })
      } catch {
        /* best effort — un hold myGo redondant sans réservation locale associée
         * n'a aucun impact financier/paiement côté Easy2Book. */
      }
      const winner = await findReservationByGuestIdempotencyKey(agencyId, idempotencyKey)
      if (winner) return winner
      return {
        ok: false,
        error: "Cette réservation est en cours de traitement par une autre requête — réessayez dans quelques secondes.",
      }
    }

    // "booking/confirmed" déclenche processConfirmedBooking (PDF voucher +
    // email) sans revérifier le statut — voir Phase 14.2 : cet événement ne
    // doit JAMAIS partir pour une réservation restée `pending`
    // (transfer/cash non réglé), sous peine d'envoyer un vrai voucher pour
    // une résa non payée. Même garde que le chemin B2B
    // (lib/booking/actions.ts), reproduite ici.
    if (result.isImmediatelyPaid && traveler.email) {
      await sendEvent("booking/confirmed", {
        reservationId: result.reservationId,
        publicRef: result.publicRef,
        agencyId,
        guestAccessToken: result.guestAccessToken,
        customerEmail: traveler.email,
        customerName: `${traveler.firstName} ${traveler.lastName}`.trim(),
        customerPhone: traveler.phone,
        hotelName: myGoBooking.hotelName ?? draft.offerLabel,
        checkIn: draft.startDate,
        checkOut: draft.endDate ?? draft.startDate,
        nights: hotelNights,
        adults: draft.adults,
        children: draft.children,
        totalTnd: breakdown.totalTnd,
      }).catch(() => {
        /* fire-and-forget */
      })
    }

    // Facture uniquement pour un règlement réellement capturé maintenant —
    // jamais pour une réservation `pending` non payée (voir Phase 12 §12).
    if (result.isImmediatelyPaid) {
      try {
        const invoiceResult = await generateInvoiceForReservation({
          agencyId,
          reservationId: result.reservationId,
          actorUserId: "",
        })
        if (!invoiceResult.ok) {
          console.error("[guest-booking] génération facture échouée", invoiceResult.error)
        }
      } catch (err) {
        console.error(
          "[guest-booking] génération facture échouée",
          err instanceof Error ? err.message : String(err),
        )
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
    let compensationNote = ""
    try {
      await (myGoAccess.client ?? getMyGoClient()).cancelBooking({ bookingId: myGoBooking.bookingId })
    } catch {
      compensationNote = ` Réservation fournisseur ${myGoBooking.bookingId} potentiellement toujours active — contactez le support immédiatement avec cette référence.`
    }
    // Solde wallet insuffisant : transaction annulée (ROLLBACK, aucune
    // réservation créée), résa fournisseur compensée ci-dessus — message
    // clair plutôt que l'erreur interne générique, même distinction que
    // INSUFFICIENT_BALANCE côté B2B (lib/booking/actions.ts).
    if (err instanceof WalletDebitFailedError) {
      return {
        ok: false,
        error:
          err.code === "INSUFFICIENT_FUNDS"
            ? `Solde wallet insuffisant pour ce règlement.${compensationNote}`
            : `${err.message}${compensationNote}`,
        code: err.code,
      }
    }
    return {
      ok: false,
      error:
        "Erreur interne lors de la création de la réservation." + compensationNote,
    }
  }
}
