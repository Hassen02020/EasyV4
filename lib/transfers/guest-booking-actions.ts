"use server"

/**
 * Réservation transfert B2C autonome (guest checkout).
 *
 * Chemin PARALLÈLE à createTransferBooking (lib/transfers/actions.ts) —
 * celui-ci reste intact pour le B2B. Même principe que le tunnel guest
 * existant (Omra, Activités, Hôtel, Package) :
 *   - agencyId résolu via getDefaultAgencyId() (agence OTA directe)
 *   - Aucun débit wallet (debitPartnerCredit est réservé aux comptes agence)
 *   - status "pending" + payment "pending" — règlement différé confirmé par
 *     l'équipe Easy2Book hors-ligne (virement ou espèces)
 *   - Prix 100% dérivé du serveur (calculateTransferPrice) ; aucune valeur
 *     fournie par le client n'est jamais utilisée comme base de facturation
 *   - guestAccessToken généré par DB (DEFAULT), retourné au client pour
 *     /booking/confirmation/[ref]?token=…
 */

import { eq, and, sql } from "drizzle-orm"
import { withTenantContext, withSystemContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  reservations,
  reservationTransfer,
  customers,
  auditEvents,
  catalogTransferZones,
  payments,
} from "@/lib/db/schema"
import { calculateTransferPrice } from "./pricing"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { withGuestIdempotency } from "@/lib/booking/guest-idempotency"
import { resolveLinkedAuthUserId } from "@/lib/booking/customer-identity"
import { recordReservationFinancials } from "@/lib/finance/reservation-financials"
import { creditPlatformCommission } from "@/lib/finance/platform-commission"
import { resolveCheckoutPromoCore } from "@/lib/crm/promo-checkout-core"
import { applyPromoDiscountCore } from "@/lib/finance/promo-discount-core"
import { priceDrifted } from "@/lib/booking/pricing"
import { buildTransferPickupAt } from "@/lib/transfers/pickup-at"
import {
  DUPLICATE_CONTENT_WINDOW_MS,
  decideReplay,
  fingerprintIdentity,
  fingerprintRequest,
  getAttemptTokenMode,
  verifyAttemptToken,
} from "@/lib/booking/attempt-token"

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface GuestTransferBookingInput {
  fromZoneId: string
  toZoneId: string
  vehicleType: "sedan" | "van" | "minibus" | "bus" | "luxury"
  pickupDate: string // YYYY-MM-DD
  pickupTime: string // HH:MM
  flightNumber?: string
  flightArrivalAt?: string // ISO datetime
  pax: number
  luggageCount?: number
  customer: {
    firstName: string
    lastName: string
    phone: string
    email?: string
    civicId?: string
  }
  /**
   * PRICING-PROMO-LINK-01 — INDICE transporté par le client (lien de
   * campagne), jamais une autorisation. L'éligibilité réelle est
   * TOUJOURS re-dérivée côté serveur (`resolveCheckoutPromoCore`) à
   * partir du contact RÉEL du client (`customer.email`/`phone`),
   * jamais déduite de ce champ seul.
   */
  campaignId?: string
  /**
   * TRANSFERS-CARS-DRIFT-01 — prix affiché côté client au moment de la
   * soumission. Comparé au prix recalculé côté serveur AVANT promotion
   * et toute écriture persistée. Absent dans les flux B2B (journey) —
   * la garde saute silencieusement.
   */
  expectedTotalTnd?: number
  /**
   * GUEST-IDEMPOTENCY-01 — jeton de tentative émis par le serveur
   * (`issueGuestAttemptToken`). Ignoré en mode `off` (défaut).
   */
  attemptToken?: string
  /**
   * D9 « avertir » — le client confirme vouloir créer une seconde
   * réservation au contenu identique (après avertissement DUPLICATE_CONTENT).
   */
  acknowledgeDuplicate?: boolean
}

export type CreateGuestTransferBookingResult =
  | {
      ok: true
      reservationId: string
      publicRef: string
      guestAccessToken: string
      totalTnd: number
    }
  | { ok: false; error: string; code?: string }

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function pad(n: number, w = 6) {
  return String(n).padStart(w, "0")
}

async function nextPublicRef(
  tx: DrizzleTransaction,
  agencyId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `TR-${year}-`
  // CAS-B — sérialise les nextPublicRef() concurrents de la même (agencyId, année)
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${agencyId + ":" + prefix}))`,
  )
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
/* Public Action                                                              */
/* -------------------------------------------------------------------------- */

export async function createGuestTransferBooking(
  input: GuestTransferBookingInput,
): Promise<CreateGuestTransferBookingResult> {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }
  if (input.pax <= 0 || input.pax > 50) {
    return { ok: false, error: "Nombre de passagers invalide (1-50)" }
  }

  // Heure locale tunisienne → instant UTC (voir lib/transfers/pickup-at.ts).
  const pickupAt = buildTransferPickupAt(input.pickupDate, input.pickupTime)
  if (!pickupAt) {
    return { ok: false, error: "Date ou heure de prise en charge invalide" }
  }

  const { createHash } = await import("node:crypto")
  const idempotencyKey = createHash("sha256")
    .update(
      JSON.stringify({
        fromZoneId: input.fromZoneId,
        toZoneId: input.toZoneId,
        vehicleType: input.vehicleType,
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        phone: input.customer.phone,
      }),
    )
    .digest("hex")

  const linkedAuthUserId = await resolveLinkedAuthUserId(input.customer.email)

  // PAY-IDEM-DB-01 — agencyId résolu ici pour que le fallback DB puisse
  // vérifier une réservation déjà créée quand Redis est indisponible, avant
  // tout re-INSERT qui échouerait en contrainte unique.
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) {
    return {
      ok: false,
      error: "Aucune agence de vente directe n'est configurée pour le moment.",
      code: "NO_AGENCY",
    }
  }

  const mode = getAttemptTokenMode()

  // M0 — comportement historique, strictement inchangé.
  if (mode === "off") {
    return withGuestIdempotency(
      idempotencyKey,
      () =>
        runCreateGuestTransferBooking(
          input,
          agencyId,
          idempotencyKey,
          linkedAuthUserId,
          null,
        ),
      undefined,
      () => findTransferReservationByIdempotencyKey(agencyId, idempotencyKey),
    )
  }

  // GUEST-IDEMPOTENCY-01 — empreintes d'identité (D15 : e-mail + téléphone),
  // de requête complète (rejeu d'un jeton) et de contenu (contrôle niveau 2).
  const identityFp = fingerprintIdentity("transfer", agencyId, {
    email: input.customer.email,
    phone: input.customer.phone,
  })
  const core = [
    input.fromZoneId,
    input.toZoneId,
    input.vehicleType,
    input.pickupDate,
    input.pickupTime,
    input.pax,
  ]
  const fps = {
    identityFp,
    contentFp: fingerprintRequest("transfer", agencyId, identityFp, core),
    requestFp: fingerprintRequest("transfer", agencyId, identityFp, [
      ...core,
      input.luggageCount ?? 0,
      input.flightNumber ?? "",
      input.flightArrivalAt ?? "",
      input.campaignId ?? "",
    ]),
    acknowledgeDuplicate: input.acknowledgeDuplicate === true,
  }

  if (input.attemptToken) {
    const v = verifyAttemptToken(input.attemptToken, "transfer", agencyId)
    if (!v.ok) {
      return {
        ok: false,
        code: v.reason === "expired" ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
        error:
          "Cette page de réservation a expiré. Rechargez la page pour continuer.",
      }
    }
    return runTokenAttempt(input, agencyId, linkedAuthUserId, {
      key: v.key,
      ...fps,
    })
  }

  // Sans jeton. M2 : création interdite, rejeu seul (par la clé de contenu
  // historique, avec contrôle d'identité). M1 : chemin historique + niveau 2.
  if (mode === "enforce") {
    const row = await findTransferReplayRow(agencyId, idempotencyKey)
    if (row) {
      return replayResult(row, { key: idempotencyKey, ...fps }, agencyId)
    }
    return {
      ok: false,
      code: "TOKEN_REQUIRED",
      error:
        "Cette page de réservation est périmée. Rechargez la page pour continuer.",
    }
  }
  // M1 sans jeton : source de vérité = la base (comme le chemin à jeton). Le
  // cache Redis n'est volontairement pas utilisé ici : il met en cache aussi
  // les refus (ex. avertissement de doublon) et bloquerait la confirmation.
  return runTokenAttempt(input, agencyId, linkedAuthUserId, {
    key: idempotencyKey,
    ...fps,
  })
}

/* -------------------------------------------------------------------------- */
/* GUEST-IDEMPOTENCY-01 — tentative par jeton, source de vérité = la base     */
/* -------------------------------------------------------------------------- */

interface AttemptContext {
  key: string
  identityFp: string
  requestFp: string
  contentFp: string
  acknowledgeDuplicate: boolean
}

interface ReplayRow {
  id: string
  publicRef: string
  guestAccessToken: string
  tndAmount: string | null
  providerPayload: Record<string, unknown> | null
  customerEmail: string | null
  customerPhone: string | null
}

async function findTransferReplayRow(
  agencyId: string,
  key: string,
): Promise<ReplayRow | null> {
  const rows = await withSystemContext((db) =>
    db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
        tndAmount: reservations.tndAmount,
        providerPayload: reservations.providerPayload,
        customerEmail: customers.email,
        customerPhone: customers.phone,
      })
      .from(reservations)
      .leftJoin(customers, eq(customers.id, reservations.customerId))
      .where(
        and(
          eq(reservations.agencyId, agencyId),
          eq(reservations.guestIdempotencyKey, key),
          eq(reservations.module, "transfer"),
        ),
      )
      .limit(1),
  )
  return (rows[0] as ReplayRow | undefined) ?? null
}

function replayResult(
  row: ReplayRow,
  attempt: AttemptContext,
  agencyId: string,
): CreateGuestTransferBookingResult {
  const payload = row.providerPayload ?? {}
  // Réservation d'avant déploiement : pas d'empreinte stockée → l'identité
  // est reconstituée depuis le client enregistré ; la requête, déjà
  // rapprochée par la clé de contenu historique, n'est pas re-comparée.
  const storedIdentity =
    typeof payload.idemIdentityFp === "string"
      ? payload.idemIdentityFp
      : fingerprintIdentity("transfer", agencyId, {
          email: row.customerEmail,
          phone: row.customerPhone,
        })
  const storedRequest =
    typeof payload.idemRequestFp === "string"
      ? payload.idemRequestFp
      : attempt.requestFp
  const decision = decideReplay(
    { identityFp: storedIdentity, requestFp: storedRequest },
    attempt,
  )
  if (decision === "mismatch") {
    return {
      ok: false,
      code: "TOKEN_REUSED",
      error:
        "Cette réservation a déjà été enregistrée avec d'autres informations. Rechargez la page pour effectuer une nouvelle demande.",
    }
  }
  return {
    ok: true,
    reservationId: row.id,
    publicRef: row.publicRef,
    guestAccessToken: row.guestAccessToken,
    totalTnd: Number(row.tndAmount ?? 0),
  }
}

/**
 * Requêtes déjà en cours DANS CETTE INSTANCE, par clé. Évite que N requêtes
 * simultanées du même jeton occupent chacune une connexion du pool (max 10)
 * pour attendre le même verrou : les suivantes attendent la première, puis
 * relisent la base. Entre instances, seul l'index unique fait foi.
 */
const inflightAttempts = new Map<
  string,
  Promise<CreateGuestTransferBookingResult>
>()

async function runTokenAttempt(
  input: GuestTransferBookingInput,
  agencyId: string,
  linkedAuthUserId: string | null,
  attempt: AttemptContext,
): Promise<CreateGuestTransferBookingResult> {
  const pending = inflightAttempts.get(attempt.key)
  if (pending) {
    await pending.catch(() => undefined)
    const row = await findTransferReplayRow(agencyId, attempt.key)
    if (row) return replayResult(row, attempt, agencyId)
    // La première tentative n'a rien créé (validation en échec) : on tente.
  }
  const p = attemptOnce(input, agencyId, linkedAuthUserId, attempt)
  inflightAttempts.set(attempt.key, p)
  try {
    return await p
  } finally {
    if (inflightAttempts.get(attempt.key) === p) {
      inflightAttempts.delete(attempt.key)
    }
  }
}

async function attemptOnce(
  input: GuestTransferBookingInput,
  agencyId: string,
  linkedAuthUserId: string | null,
  attempt: AttemptContext,
): Promise<CreateGuestTransferBookingResult> {
  const existing = await findTransferReplayRow(agencyId, attempt.key)
  if (existing) return replayResult(existing, attempt, agencyId)

  const res = await runCreateGuestTransferBooking(
    input,
    agencyId,
    attempt.key,
    linkedAuthUserId,
    attempt,
  )
  if (!res.ok && res.code === "UNIQUE_CONFLICT") {
    // Course inter-instances : une autre requête du même jeton a committé
    // entre-temps. Notre transaction est annulée (rien créé) ; la gagnante
    // fait foi.
    const winner = await findTransferReplayRow(agencyId, attempt.key)
    if (winner) return replayResult(winner, attempt, agencyId)
    return {
      ok: false,
      code: "INTERNAL_ERROR",
      error: "Erreur interne. Veuillez réessayer ou nous contacter.",
    }
  }
  return res
}

function isGuestIdempotencyConflict(err: unknown): boolean {
  const e = err as { code?: string; constraint_name?: string; cause?: unknown }
  const code = e?.code ?? (e?.cause as { code?: string } | undefined)?.code
  const name =
    e?.constraint_name ??
    (e?.cause as { constraint_name?: string } | undefined)?.constraint_name
  return code === "23505" && name === "reservations_guest_idempotency_uniq"
}

async function findTransferReservationByIdempotencyKey(
  agencyId: string,
  idempotencyKey: string,
): Promise<CreateGuestTransferBookingResult | null> {
  const rows = await withSystemContext((db) =>
    db
      .select({
        id: reservations.id,
        publicRef: reservations.publicRef,
        guestAccessToken: reservations.guestAccessToken,
        tndAmount: reservations.tndAmount,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.agencyId, agencyId),
          eq(reservations.guestIdempotencyKey, idempotencyKey),
          eq(reservations.module, "transfer"),
        ),
      )
      .limit(1),
  )
  const row = rows[0]
  if (!row) return null
  return {
    ok: true,
    reservationId: row.id,
    publicRef: row.publicRef,
    guestAccessToken: row.guestAccessToken,
    totalTnd: Number(row.tndAmount ?? 0),
  }
}

/* -------------------------------------------------------------------------- */
/* Internal runner                                                            */
/* -------------------------------------------------------------------------- */

async function runCreateGuestTransferBooking(
  input: GuestTransferBookingInput,
  agencyId: string,
  idempotencyKey: string,
  linkedAuthUserId: string | null,
  attempt: AttemptContext | null,
): Promise<CreateGuestTransferBookingResult> {
  try {
    const result = await withTenantContext(
      { agencyId, userId: "", isSuperAdmin: false },
      async (tx) => {
        // GUEST-IDEMPOTENCY-01 niveau 2 — contrôle de contenu (D9 « avertir »),
        // sérialisé par un verrou consultatif sur l'empreinte : deux créations
        // concurrentes du même contenu (jetons différents, ou jeton et chemin
        // historique) ne peuvent pas toutes deux passer sans se voir.
        if (attempt) {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${"idem-content:" + agencyId + ":" + attempt.contentFp}))`,
          )
          if (!attempt.acknowledgeDuplicate) {
            const dup = await tx
              .select({ id: reservations.id })
              .from(reservations)
              .where(
                and(
                  eq(reservations.agencyId, agencyId),
                  eq(reservations.module, "transfer"),
                  sql`${reservations.providerPayload}->>'idemContentFp' = ${attempt.contentFp}`,
                  sql`${reservations.status} NOT IN ('cancelled','expired')`,
                  sql`${reservations.createdAt} > now() - make_interval(secs => ${DUPLICATE_CONTENT_WINDOW_MS / 1000})`,
                  sql`${reservations.guestIdempotencyKey} IS DISTINCT FROM ${attempt.key}`,
                ),
              )
              .limit(1)
            if (dup.length > 0) throw new Error("DUPLICATE_CONTENT")
          }
        }
        // 1. Prix 100% serveur — jamais fourni par le client
        const pricing = await calculateTransferPrice({
          fromZoneId: input.fromZoneId,
          toZoneId: input.toZoneId,
          vehicleType: input.vehicleType,
          pickupDate: input.pickupDate,
          pickupTime: input.pickupTime,
          agencyId,
          channel: "direct",
        })
        if (!pricing) throw new Error("NO_PRICING")

        // --- PRICING-PROMO-LINK-01 — remise PROMO, si éligible ---
        // Appliquée ICI, AVANT toute dérivation (reservations/payments/
        // recordReservationFinancials consomment tous `totalTnd`
        // ci-dessous) — jamais seulement avant l'enregistrement
        // financier. `campaignId` est un INDICE transporté par le
        // client, jamais une autorisation : `resolveCheckoutPromoCore`
        // re-dérive l'éligibilité réelle depuis le contact réel.
        // Transfert : pas de coût fournisseur séparé (prix catalogue =
        // prix de vente, voir recordReservationFinancials ci-dessous) —
        // `supplierPriceTnd` omis, jamais fabriqué.
        let totalTnd = pricing.totalTnd
        if (priceDrifted(input.expectedTotalTnd, totalTnd)) {
          throw new Error(
            `PRICE_CHANGED: prix affiché ${input.expectedTotalTnd} TND → prix réel ${totalTnd} TND`,
          )
        }
        if (input.campaignId) {
          const checkoutPromo = await resolveCheckoutPromoCore(tx, {
            agencyId,
            campaignId: input.campaignId,
            email: input.customer.email ?? null,
            phone: input.customer.phone,
          })
          if (checkoutPromo.eligible) {
            totalTnd = applyPromoDiscountCore(
              totalTnd,
              checkoutPromo.discount,
            ).finalPriceTnd
          }
        }

        // 2. Noms des zones pour l'affichage
        const [fromZone] = await tx
          .select({ name: catalogTransferZones.name })
          .from(catalogTransferZones)
          .where(eq(catalogTransferZones.id, input.fromZoneId))
          .limit(1)
        const [toZone] = await tx
          .select({ name: catalogTransferZones.name })
          .from(catalogTransferZones)
          .where(eq(catalogTransferZones.id, input.toZoneId))
          .limit(1)

        const offerLabel = `${fromZone?.name ?? input.fromZoneId} → ${toZone?.name ?? input.toZoneId}`

        // 3. Client
        const [customer] = await tx
          .insert(customers)
          .values({
            agencyId,
            civility: "M",
            firstName: input.customer.firstName,
            lastName: input.customer.lastName,
            email: input.customer.email,
            phone: input.customer.phone,
            civicId: input.customer.civicId,
            civicIdType: input.customer.civicId ? "cin" : undefined,
            authUserId: linkedAuthUserId ?? undefined,
          })
          .returning({ id: customers.id })

        // 4. Réservation générique — status "pending" (pas de débit wallet)
        const publicRef = await nextPublicRef(tx, agencyId)
        const [reservation] = await tx
          .insert(reservations)
          .values({
            agencyId,
            customerId: customer.id,
            publicRef,
            guestIdempotencyKey: idempotencyKey,
            module: "transfer",
            source: "internal",
            status: "pending",
            originalCurrency: "TND",
            originalAmount: totalTnd.toFixed(2),
            tndAmount: totalTnd.toFixed(2),
            depositAmount: totalTnd.toFixed(2),
            depositPaid: "0",
            providerPayload: {
              fromZoneId: input.fromZoneId,
              toZoneId: input.toZoneId,
              fromZoneName: fromZone?.name,
              toZoneName: toZone?.name,
              vehicleType: input.vehicleType,
              pickupDate: input.pickupDate,
              pickupTime: input.pickupTime,
              pax: input.pax,
              luggageCount: input.luggageCount,
              flightNumber: input.flightNumber,
              flightArrivalAt: input.flightArrivalAt,
              pricing,
              // Champs lisibles par /booking/confirmation/[ref]
              offerLabel,
              startDate: input.pickupDate,
              channel: "b2c_guest",
              paymentMethod: "transfer",
              ...(attempt
                ? {
                    idemIdentityFp: attempt.identityFp,
                    idemRequestFp: attempt.requestFp,
                    idemContentFp: attempt.contentFp,
                  }
                : {}),
            },
          })
          .returning({
            id: reservations.id,
            guestAccessToken: reservations.guestAccessToken,
          })

        const reservationId = reservation.id
        const guestAccessToken = reservation.guestAccessToken

        // 5. Données financières (Break 4 — Chantier 62 : tous les modules)
        // ECON-WIRING-02 — economic_entitlements. Même pattern que le module
        // B2B (lib/transfers/actions.ts) : catalogue propre à l'agence OTA,
        // pas de fournisseur externe modélisé. Coût = base + majoration nuit
        // (avant marge), marge = totalTnd - coût.
        // CANCEL-COMMISSION-WRITER-01 : même pattern que Transfers B2B.
        const transferSupplierCostTnd =
          pricing.basePriceTnd + pricing.nightSurchargeAmount
        const transferMarginTnd = totalTnd - transferSupplierCostTnd
        const commissionRateForEntitlements = pricing.commissionPercent ?? 0
        const commissionAmountForEntitlements =
          Math.round(
            transferMarginTnd * (commissionRateForEntitlements / 100) * 100,
          ) / 100
        const { commissionAmount } = await recordReservationFinancials({
          tx,
          reservationId,
          supplierPriceTnd: transferSupplierCostTnd,
          salePriceTnd: totalTnd,
          commissionPercent: pricing.commissionPercent,
          economicEntitlements: [
            {
              partyType: "agency",
              partyId: agencyId,
              role: "product_owner",
              qualification: "supplier_cost",
              amount: transferSupplierCostTnd,
              basis: "tarif propre de l'agence OTA (base + majoration nuit)",
            },
            {
              partyType: "agency",
              partyId: agencyId,
              role: "seller",
              qualification: "seller_margin",
              amount: transferMarginTnd - commissionAmountForEntitlements,
              basis:
                "marge vendeur nette de commission (agence product_owner ET seller sur son propre tarif)",
            },
            ...(commissionAmountForEntitlements > 0
              ? [
                  {
                    partyType: "easy2book",
                    partyId: null as null,
                    role: "easy2book" as const,
                    qualification: "commission" as const,
                    amount: commissionAmountForEntitlements,
                    basis: `commission Easy2Book sur marge (${commissionRateForEntitlements}% × marge)`,
                    cancellationTreatment: "non_refundable" as const,
                  },
                ]
              : []),
          ],
        })
        await creditPlatformCommission(tx, {
          reservationId,
          commissionAmount,
          description: `Commission transfert — réservation ${publicRef}`,
        })

        // 6. Paiement en attente — règlement différé (virement / espèces)
        await tx.insert(payments).values({
          agencyId,
          reservationId,
          psp: "manual",
          method: "transfer",
          originalCurrency: "TND",
          originalAmount: totalTnd.toFixed(2),
          tndAmount: totalTnd.toFixed(2),
          kind: "deposit",
          status: "pending",
        })

        // 7. Extension Transfer
        const pickupAt = buildTransferPickupAt(
          input.pickupDate,
          input.pickupTime,
        )
        if (!pickupAt) throw new Error("INVALID_PICKUP_DATETIME")
        await tx.insert(reservationTransfer).values({
          reservationId,
          agencyId,
          pickupZoneId: input.fromZoneId,
          dropoffZoneId: input.toZoneId,
          pickupAddress: fromZone?.name,
          dropoffAddress: toZone?.name,
          pickupAt,
          flightNumber: input.flightNumber,
          flightArrivalAt: input.flightArrivalAt
            ? new Date(input.flightArrivalAt)
            : undefined,
          pax: input.pax,
          luggageCount: input.luggageCount ?? 0,
          vehicleType: input.vehicleType,
          statusTimeline: {
            created: { at: new Date().toISOString(), status: "created" },
          },
        })

        // 7. Audit
        await tx.insert(auditEvents).values({
          agencyId,
          actorUserId: null,
          entityType: "reservation",
          entityId: reservationId,
          action: "transfer_booking.created",
          diff: {
            fromZoneId: input.fromZoneId,
            toZoneId: input.toZoneId,
            vehicleType: input.vehicleType,
            pickupDate: input.pickupDate,
            pickupTime: input.pickupTime,
            pax: input.pax,
            totalTnd,
            publicRef,
            channel: "b2c_guest",
          },
        })

        return {
          reservationId,
          publicRef,
          guestAccessToken,
          totalTnd,
          fromZoneName: fromZone?.name ?? input.fromZoneId,
          toZoneName: toZone?.name ?? input.toZoneId,
        }
      },
    )

    // Transferts B2C — réservation toujours status "pending" (paiement
    // différé, aucune voie CB disponible actuellement). L'email "Votre
    // transfert est confirmé !" ne doit être envoyé qu'après confirmation
    // réelle. sendEvent("booking/transfer.confirmed") à re-déclencher ICI
    // dès qu'une voie card sera ajoutée, protégé par : if (isImmediatelyPaid) { ... }

    return {
      ok: true,
      reservationId: result.reservationId,
      publicRef: result.publicRef,
      guestAccessToken: result.guestAccessToken,
      totalTnd: result.totalTnd,
    }
  } catch (err) {
    if (attempt && isGuestIdempotencyConflict(err)) {
      return {
        ok: false,
        code: "UNIQUE_CONFLICT",
        error: "Réservation déjà en cours de traitement.",
      }
    }
    const msg = err instanceof Error ? err.message : String(err)
    const codes: Record<string, string> = {
      NO_PRICING: "Aucun tarif configuré pour cet itinéraire et ce véhicule",
      PRICE_CHANGED:
        msg.match(/PRICE_CHANGED: (.+)/)?.[1] ??
        "Le prix a changé, veuillez recharger la page.",
      DUPLICATE_CONTENT:
        "Une réservation identique existe déjà pour ces informations. Confirmez si vous souhaitez en créer une seconde.",
    }
    const code = Object.keys(codes).find((k) => msg.startsWith(k))
    if (!code)
      console.error("[createGuestTransferBooking] erreur interne:", err)
    return {
      ok: false,
      // Le message brut de la base n'est plus renvoyé au client (journalisé).
      error: code
        ? codes[code]
        : "Erreur interne. Veuillez réessayer ou nous contacter.",
      code: code ?? "INTERNAL_ERROR",
    }
  }
}
