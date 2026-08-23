"use server"

import { redirect } from "next/navigation"
import { eq, desc, and, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { withTenantContext } from "@/lib/db/tenant-context"
import {
  customers,
  reservations,
  reservationHotel,
  payments,
  auditEvents,
} from "@/lib/db/schema"
import type { BookingDraft, TravelerInput } from "./schemas"
import { bookingDraftSchema, travelerSchemaWithIdRule } from "./schemas"
import { computePriceBreakdown } from "./pricing"
import { decodeDraft } from "./draft-store"
import { debitPartnerCredit } from "@/lib/pro/booking-actions"
import { getMarginsForAgency } from "@/lib/pro/server-context"
import { applyMargin } from "@/lib/pro/pricing"
import { generateInvoiceForReservation } from "@/lib/finance/invoice-actions"
import { sendEvent } from "@/lib/inngest/client"
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
export async function confirmHotelWithProvider(
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

export async function nextPublicRef(
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
  | { ok: true; reservationId: string; publicRef: string; guestAccessToken: string }
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

  // Calculé une seule fois, réutilisé pour l'insert reservationHotel ET pour
  // le payload de l'événement Inngest booking/confirmed après la transaction.
  const hotelStartDate = new Date(draft.startDate)
  const hotelEndDate = draft.endDate ? new Date(draft.endDate) : hotelStartDate
  const hotelNights = Math.max(
    1,
    Math.round(
      (hotelEndDate.getTime() - hotelStartDate.getTime()) / (1000 * 60 * 60 * 24),
    ),
  )

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

  // SÉCURITÉ (Phase 11, P0) : `draft` provient de `decodeDraft()`, un token
  // base64url NON SIGNÉ (voir lib/booking/draft-store.ts) — n'importe quel
  // compte partenaire authentifié peut forger un draft avec
  // `unitPriceTnd` arbitraire (ex. 0.001 DT) via
  // `bootstrapDraftFromParams()` (app/booking/page.tsx), qui lit
  // `unitPriceTnd` directement depuis la query string sans validation
  // contre une offre réelle. Avant ce correctif, quand `myGoBooking` était
  // `null` — donc pour TOUT module autre que "hotel", ET pour "hotel" avec
  // des métadonnées myGo absentes/invalides — le prix débité tombait sur
  // `draft.unitPriceTnd`, entièrement contrôlé par le client : un compte
  // partenaire pouvait se faire débiter un montant dérisoire pour une
  // réservation réellement créée et confirmée en base.
  //
  // Aucun module autre que "hotel" (via myGo, chemin ci-dessus) n'a
  // aujourd'hui de source de prix serveur fiable branchée sur CE pipeline
  // générique : Transferts/Omra/Car ont leurs propres actions dédiées
  // (`createTransferBooking`, `createOmraBooking`, `createCarBooking`) qui
  // calculent déjà le prix côté serveur depuis de vraies tables — elles ne
  // passent pas par ici. Vols/Hôtels Monde n'ont pas de réservation réelle
  // du tout (booking désactivé en UI, aucun fournisseur branché). Donc
  // refuser ce chemin dès que `myGoBooking` est `null` ne retire aucune
  // fonctionnalité réellement utilisée aujourd'hui (le seul appelant vivant,
  // `app/hotels/search/page.tsx::handleBookHotel`, fournit toujours des
  // métadonnées myGo valides) — et ferme la faille pour tout appel direct/
  // forgé, qu'il cible "hotel" sans métadonnées ou n'importe quel autre
  // module.
  if (!myGoBooking) {
    return {
      ok: false,
      error:
        "Cette réservation ne peut pas être confirmée : aucun prix vérifié par le fournisseur n'est disponible pour cette offre.",
    }
  }

  // Le total myGo fait foi — le brouillon est un token base64url non signé,
  // donc `draft.unitPriceTnd` n'est jamais utilisé pour calculer le montant
  // réellement débité (voir garde ci-dessus).
  //
  // Phase 9 : `createReservationFromDraft` n'est atteignable qu'avec une
  // session résolue par `getCurrentPartnerProfile` ci-dessus (agence
  // `agency_type = 'partner'` par construction — voir Cas 1/Cas 2 de
  // `lib/auth/partner-profile.ts`, aucune autre voie n'existe vers cette
  // action). Le montant réellement débité doit donc toujours être le prix
  // AGENCE (marge appliquée), jamais le prix net fournisseur — sinon
  // brancher le pont B2B hôtel (Phase 9) sur ce pipeline aurait débité les
  // agences au prix net myGo, sans aucune marge, pour toute réservation
  // hôtel réellement confirmée. Marge existante réutilisée telle quelle
  // (`applyMargin`, `getMarginsForAgency`) — pas une deuxième formule.
  const agencyHotelPrice = applyMargin(
    myGoBooking.totalPrice,
    (await getMarginsForAgency(agencyId, authUserId)).hotel,
  )

  const breakdown = computePriceBreakdown({
    ...authoritativeUnitPrice(agencyHotelPrice, draft.adults),
    adults: draft.adults,
    children: draft.children,
  })

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
        .returning({
          id: reservations.id,
          publicRef: reservations.publicRef,
          guestAccessToken: reservations.guestAccessToken,
        })
      const reservationId = inserted[0].id
      const guestAccessToken = inserted[0].guestAccessToken

      if (draft.module === "hotel") {
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
          nights: hotelNights,
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

      // --- Débit crédit agence — dans la MÊME transaction (txOverride) : sans ça,
      // le débit committerait indépendamment de l'insertion de la réservation
      // (perte d'atomicité — trouvé pendant l'audit RLS, corrigé pour ce
      // chemin). Débite `agencies.deposit_balance` via `partner_credit_movements`
      // — le SEUL solde que les flux de rechargement réels (recharge B2B,
      // recharge admin direct) créditent. L'ancien `walletDebitReservation`
      // débitait `wallets.balance`, une colonne que plus aucun flux de
      // rechargement en production ne peut créditer : trouvé pendant l'audit
      // wallet/paiement — corrigé en unifiant sur `agencies.deposit_balance`.
      const debitResult = await debitPartnerCredit({
        agencyId,
        amountTnd: breakdown.totalTnd,
        reference: publicRef,
        description: `Réservation ${draft.module} — ${draft.offerLabel}`,
        createdByUserId: authUserId,
        reservationId,
        // Idempotence : un double-submit sur le même brouillon (double-clic,
        // deux onglets) ne doit débiter qu'une fois.
        idempotencyKey: `booking-debit:${reservationId}`,
        txOverride: tx as Parameters<typeof debitPartnerCredit>[0]["txOverride"],
      })

      if (!debitResult.ok) {
        throw new Error(
          debitResult.code === "INSUFFICIENT_FUNDS"
            ? `INSUFFICIENT_BALANCE:${breakdown.totalTnd.toFixed(3)}`
            : `WALLET_ERROR:${debitResult.message}`,
        )
      }

      // Marquer la réservation confirmée + enregistrer le paiement — fait
      // auparavant à l'intérieur de walletDebitReservation ; explicite ici
      // pour que debitPartnerCredit reste une fonction ledger pure et
      // réutilisable (elle ne connaît pas le concept de "réservation").
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
        originalAmount: breakdown.totalTnd.toFixed(2),
        tndAmount: breakdown.totalTnd.toFixed(2),
        kind: "deposit",
        status: "captured",
        capturedAt: new Date(),
      })

      await tx.insert(auditEvents).values({
        agencyId,
        actorUserId: authUserId,
        entityType: "wallet",
        entityId: debitResult.movementId,
        action: "wallet.debit",
        diff: {
          reservationId,
          amount: breakdown.totalTnd,
          balanceBefore: debitResult.balanceBefore,
          balanceAfter: debitResult.balanceAfter,
        },
      })

      return { reservationId, publicRef, agencyId, guestAccessToken }
      },
    )

    // --- Événement Inngest (hors transaction, fire-and-forget) ---
    // Déclenche processConfirmedBooking (PDF voucher + email) — payload
    // aligné sur Events["booking/confirmed"]["data"] (auparavant divergent :
    // customerId/module envoyés au lieu de customerEmail/hotelName/checkIn/
    // checkOut/nights attendus par le handler, donc email jamais envoyable
    // — trouvé pendant l'audit wallet/paiement). Seul le module hôtel a un
    // handler ; les autres modules déclenchent leur propre événement dédié
    // depuis leurs server actions respectives (omra, transfert). Sans email
    // client, il n'y a personne à qui envoyer le voucher — on ne déclenche
    // pas l'événement plutôt que d'appeler le handler avec un destinataire vide.
    if (draft.module === "hotel" && traveler.email) {
      await sendEvent("booking/confirmed", {
        reservationId: result.reservationId,
        publicRef: result.publicRef,
        agencyId: result.agencyId,
        guestAccessToken: result.guestAccessToken,
        customerEmail: traveler.email,
        customerName: `${traveler.firstName} ${traveler.lastName}`.trim(),
        customerPhone: traveler.phone,
        hotelName: myGoBooking?.hotelName ?? draft.offerLabel,
        checkIn: draft.startDate,
        checkOut: draft.endDate ?? draft.startDate,
        nights: hotelNights,
        adults: draft.adults,
        children: draft.children,
        totalTnd: breakdown.totalTnd,
      }).catch(() => { /* fire-and-forget — le retry Inngest suffira */ })
    }

    // --- Facture (hors transaction) --- La réservation et le débit sont déjà
    // commités : un échec de facturation ne doit jamais invalider une
    // réservation payée. Régénérable plus tard (idempotent) si besoin.
    try {
      const invoiceResult = await generateInvoiceForReservation({
        agencyId: result.agencyId,
        reservationId: result.reservationId,
        actorUserId: authUserId,
      })
      if (!invoiceResult.ok) {
        console.error("[booking] génération facture échouée", invoiceResult.error)
      }
    } catch (err) {
      console.error("[booking] génération facture échouée", err instanceof Error ? err.message : String(err))
    }

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      guestAccessToken: result.guestAccessToken,
    }
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

/**
 * Point d'entrée unique du tunnel `/booking/*` — le seul appelant vivant
 * aujourd'hui est `app/hotels/search/page.tsx::handleBookHotel` (recherche
 * hôtel publique B2C), donc ce tunnel doit fonctionner sans session.
 *
 * Phase 12 : bascule vers `createGuestReservationFromDraft` (paiement en
 * ligne / règlement différé, agence OTA directe) dès qu'aucune session
 * partenaire n'est résolue — c'est le blocker P0 business identifié en
 * Phase 11 ("aucun parcours B2C n'aboutit à un paiement réel"). Si une
 * session partenaire EST résolue (un partenaire connecté qui utiliserait
 * malgré tout cette ancienne route générique), le comportement B2B exact
 * d'avant Phase 12 est conservé sans aucune modification —
 * `createReservationFromDraft` (et son correctif P0 Phase 11) reste
 * intact et inchangé.
 */
export async function submitCheckoutAction(formData: FormData): Promise<void> {
  const token = String(formData.get("draft") ?? "")
  if (!token) {
    throw new Error("Brouillon manquant")
  }
  const payload = decodeDraft(token)
  if (!payload || !payload.traveler) {
    throw new Error("Brouillon invalide ou incomplet")
  }
  const paymentMethod = String(formData.get("paymentMethod") ?? "card")

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const partnerProfile = user ? await getCurrentPartnerProfile(user.id) : null

  if (partnerProfile) {
    const result = await createReservationFromDraft({
      draft: payload.draft,
      traveler: payload.traveler,
    })
    if (!result.ok) {
      throw new Error(result.error)
    }
    redirect(`/booking/confirmation/${result.publicRef}?token=${result.guestAccessToken}`)
  }

  const { createGuestReservationFromDraft } = await import("./guest-actions")
  const { createHash } = await import("node:crypto")
  const result = await createGuestReservationFromDraft({
    draft: payload.draft,
    traveler: payload.traveler,
    paymentMethod: paymentMethod === "transfer" || paymentMethod === "cash" ? paymentMethod : "card",
    // Stable pour une soumission identique (même brouillon, même mode de
    // paiement) — un double-clic/retry réseau reproduit la même clé et ne
    // recrée pas une deuxième réservation (voir withGuestIdempotency).
    idempotencyKey: createHash("sha256").update(`${token}:${paymentMethod}`).digest("hex"),
  })
  if (!result.ok) {
    throw new Error(result.error)
  }
  redirect(`/booking/confirmation/${result.publicRef}?token=${result.guestAccessToken}`)
}
