"use server"

/**
 * JOURNEY-BUILDER-01 — orchestration B2B multi-produits.
 *
 * Compose un `journey` (agence + lignes) au-dessus des moteurs de
 * réservation RÉELS et déjà prouvés (jamais un nouveau booking/pricing/
 * financial engine, décision produit actée) : `createReservationFromDraft`
 * (hôtel TN), `createPackageBooking`, `createOmraBooking`,
 * `createActivityBooking`, `createTransferBooking`, `createCarBooking`,
 * `createNetworkProductBooking`.
 *
 * Volontairement HORS PÉRIMÈTRE V1 (pas un oubli) :
 *  - Vols (`lib/vols/`) : le flux réel est un `createFlightBookingRequest`
 *    ASYNCHRONE, fulfill plus tard par le staff (API_DIRECT ou B2B_OFFLINE,
 *    PROVIDER-CONNECTIVITY-BRIDGE) — pas un "confirmer maintenant"
 *    synchrone comme les 7 autres. L'intégrer proprement demanderait un
 *    statut de ligne supplémentaire ("en attente de fulfillment staff"),
 *    hors du modèle pending/processing/confirmed/failed acté pour V1.
 *  - Hôtels Monde : SEUL un chemin de réservation GUEST (B2C, paiement
 *    client direct) existe (`lib/hotels-monde/guest-booking-actions.ts`) —
 *    aucun moteur B2B (session agence + débit compte de dépôt) n'existe
 *    pour ce module aujourd'hui. En créer un serait un nouveau booking
 *    engine, explicitement interdit par la décision produit.
 *
 * IDEMPOTENCE — pourquoi 3 transactions séparées, jamais une seule :
 * `confirmJourneyLine` fait (1) un CAS pending|failed→processing dans SA
 * PROPRE transaction (`casLineToProcessingCore`, committée avant l'étape
 * suivante), (2) l'appel au moteur réel HORS de toute transaction ici (le
 * moteur gère la SIENNE, entièrement indépendante), (3) l'enregistrement du
 * résultat dans une TROISIÈME transaction séparée
 * (`recordLineOutcomeCore`). Tout regrouper dans une seule transaction
 * imbriquerait la transaction du moteur réel dans la nôtre : si notre
 * transaction externe échouait/rollback après que le moteur ait déjà
 * committé sa propre réservation+débit, le CAS reviendrait à "pending" et
 * un retry recréerait une DEUXIÈME réservation/débit réels — exactement ce
 * que la règle d'idempotence interdit. Les 3 étapes séparées et committées
 * indépendamment garantissent qu'un double-clic/refresh ne peut jamais
 * déclencher deux fois le moteur réel.
 */

import { z } from "zod"
import { resolveSessionContext, withTenantContext } from "@/lib/db/tenant-context"
import {
  createJourneyCore,
  addJourneyLineCore,
  removeJourneyLineCore,
  getJourneyWithLinesCore,
  listJourneysForAgencyCore,
  casLineToProcessingCore,
  recordLineOutcomeCore,
  JOURNEY_WIRED_MODULES,
  type JourneyWiredModule,
} from "./journeys-core"
import { createReservationFromDraft } from "@/lib/booking/actions"
import { createPackageBooking } from "@/lib/packages/booking-actions"
import { createOmraBooking } from "@/lib/omra/booking-actions"
import { createActivityBooking } from "@/lib/activities/booking-actions"
import { createTransferBooking } from "@/lib/transfers/actions"
import { createCarBooking } from "@/lib/cars/actions"
import { createNetworkProductBooking } from "@/lib/network/product-booking-actions"

/* -------------------------------------------------------------------------- */
/* Résolution acteur — jamais un agencyId fourni par le client pour un       */
/* utilisateur agence normal ; explicite et validé pour le staff (même      */
/* garde que lib/pro/margins-actions.ts::upsertAgencyPricingMargin).        */
/* -------------------------------------------------------------------------- */

type ActorContext =
  | { ok: true; agencyId: string; userId: string; isSuperAdmin: boolean }
  | { ok: false; error: string }

/** Pour créer/lister — une action qui a besoin de savoir POUR QUELLE agence
 * elle agit sans qu'aucun enregistrement existant ne le lui dise déjà. */
async function resolveActorContext(explicitAgencyId?: string): Promise<ActorContext> {
  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié" }
  if (session.isSuperAdmin) {
    if (!explicitAgencyId) {
      return { ok: false, error: "agencyId requis pour le staff (jamais déduit implicitement)" }
    }
    return { ok: true, agencyId: explicitAgencyId, userId: session.userId, isSuperAdmin: true }
  }
  if (!session.agencyId) return { ok: false, error: "Profil utilisateur introuvable" }
  return { ok: true, agencyId: session.agencyId, userId: session.userId, isSuperAdmin: false }
}

type ExistingRecordActorContext =
  | { ok: true; agencyId: string | null; userId: string; isSuperAdmin: boolean }
  | { ok: false; error: string }

/** Pour agir sur un journeyId/lineId qui existe déjà — l'agence est déjà
 * fixée par cet enregistrement, la RLS (agency_id = current_agency_id() OR
 * is_super_admin()) décide seule de l'accès. Le staff n'a jamais besoin de
 * re-fournir un agencyId ici : `isSuperAdmin: true` contourne déjà la RLS. */
async function resolveActorForExistingRecord(): Promise<ExistingRecordActorContext> {
  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié" }
  if (session.isSuperAdmin) return { ok: true, agencyId: null, userId: session.userId, isSuperAdmin: true }
  if (!session.agencyId) return { ok: false, error: "Profil utilisateur introuvable" }
  return { ok: true, agencyId: session.agencyId, userId: session.userId, isSuperAdmin: false }
}

/* -------------------------------------------------------------------------- */
/* createJourney                                                             */
/* -------------------------------------------------------------------------- */

const createJourneySchema = z.object({
  agencyId: z.string().uuid().optional(), // staff uniquement — ignoré pour une agence normale
  customerId: z.string().uuid().optional(),
  title: z.string().trim().max(200).optional(),
})

export type CreateJourneyResult = { ok: true; journeyId: string } | { ok: false; error: string }

export async function createJourney(raw: z.infer<typeof createJourneySchema>): Promise<CreateJourneyResult> {
  const parsed = createJourneySchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrée invalide." }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const actor = await resolveActorContext(parsed.data.agencyId)
  if (!actor.ok) return actor

  try {
    const journey = await withTenantContext(
      { agencyId: actor.isSuperAdmin ? null : actor.agencyId, userId: actor.userId, isSuperAdmin: actor.isSuperAdmin },
      (tx) =>
        createJourneyCore(tx, {
          agencyId: actor.agencyId,
          createdByUserId: actor.userId,
          customerId: parsed.data.customerId,
          title: parsed.data.title,
        }),
    )
    return { ok: true, journeyId: journey.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur interne" }
  }
}

/* -------------------------------------------------------------------------- */
/* addJourneyLine                                                            */
/* -------------------------------------------------------------------------- */

const addJourneyLineSchema = z.object({
  journeyId: z.string().uuid(),
  module: z.enum(JOURNEY_WIRED_MODULES),
  // Payload volontairement non typé finement ici : chaque moteur réel
  // (dispatchJourneyLine) revalide et rejette lui-même à la confirmation —
  // jamais une deuxième validation dupliquée du même schéma ici.
  payload: z.record(z.string(), z.unknown()),
  priceTnd: z.coerce.number().nonnegative().optional(),
})

export type AddJourneyLineResult = { ok: true; lineId: string } | { ok: false; error: string }

export async function addJourneyLine(raw: z.infer<typeof addJourneyLineSchema>): Promise<AddJourneyLineResult> {
  const parsed = addJourneyLineSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrée invalide." }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const actor = await resolveActorForExistingRecord()
  if (!actor.ok) return actor

  try {
    const line = await withTenantContext(
      { agencyId: actor.isSuperAdmin ? null : actor.agencyId, userId: actor.userId, isSuperAdmin: actor.isSuperAdmin },
      (tx) =>
        addJourneyLineCore(tx, {
          journeyId: parsed.data.journeyId,
          module: parsed.data.module as JourneyWiredModule,
          payload: parsed.data.payload,
          priceTnd: parsed.data.priceTnd,
        }),
    )
    return { ok: true, lineId: line.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur interne"
    if (message === "JOURNEY_NOT_FOUND") return { ok: false, error: "Journey introuvable ou non autorisé." }
    if (message === "JOURNEY_COMPOSITION_LOCKED") {
      return { ok: false, error: "Ce Journey a déjà une confirmation en cours ou terminée — composition verrouillée." }
    }
    return { ok: false, error: message }
  }
}

/* -------------------------------------------------------------------------- */
/* removeJourneyLine                                                         */
/* -------------------------------------------------------------------------- */

const removeJourneyLineSchema = z.object({
  lineId: z.string().uuid(),
})

export type RemoveJourneyLineResult = { ok: true } | { ok: false; error: string }

export async function removeJourneyLine(raw: z.infer<typeof removeJourneyLineSchema>): Promise<RemoveJourneyLineResult> {
  const parsed = removeJourneyLineSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrée invalide." }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const actor = await resolveActorForExistingRecord()
  if (!actor.ok) return actor

  try {
    await withTenantContext(
      { agencyId: actor.isSuperAdmin ? null : actor.agencyId, userId: actor.userId, isSuperAdmin: actor.isSuperAdmin },
      (tx) => removeJourneyLineCore(tx, { lineId: parsed.data.lineId }),
    )
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur interne"
    if (message === "LINE_NOT_FOUND") return { ok: false, error: "Ligne introuvable ou non autorisée." }
    if (message === "LINE_NOT_REMOVABLE") {
      return { ok: false, error: "Une ligne confirmée ou en cours ne peut pas être supprimée." }
    }
    return { ok: false, error: message }
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatcher — un seul point d'entrée par module, jamais une deuxième      */
/* formule de prix/booking : chaque branche appelle le moteur réel tel      */
/* quel et normalise sa réponse.                                            */
/* -------------------------------------------------------------------------- */

type DispatchOutcome = { ok: true; reservationId: string; priceTnd?: number } | { ok: false; error: string }

async function dispatchJourneyLine(module: JourneyWiredModule, payload: unknown): Promise<DispatchOutcome> {
  switch (module) {
    case "hotel": {
      const input = payload as Parameters<typeof createReservationFromDraft>[0]
      const result = await createReservationFromDraft(input)
      return result.ok
        ? { ok: true, reservationId: result.reservationId }
        : { ok: false, error: result.error }
    }
    case "package": {
      const input = payload as Parameters<typeof createPackageBooking>[0]
      const result = await createPackageBooking(input)
      return result.ok
        ? { ok: true, reservationId: result.reservationId }
        : { ok: false, error: result.error }
    }
    case "omra": {
      const input = payload as Parameters<typeof createOmraBooking>[0]
      const result = await createOmraBooking(input)
      return result.ok
        ? { ok: true, reservationId: result.reservationId }
        : { ok: false, error: result.error }
    }
    case "activity": {
      const input = payload as Parameters<typeof createActivityBooking>[0]
      const result = await createActivityBooking(input)
      return result.ok
        ? { ok: true, reservationId: result.reservationId }
        : { ok: false, error: result.error }
    }
    case "transfer": {
      const input = payload as Parameters<typeof createTransferBooking>[0]
      const result = await createTransferBooking(input)
      return result.ok
        ? { ok: true, reservationId: result.reservationId, priceTnd: result.totalTnd }
        : { ok: false, error: result.error }
    }
    case "car": {
      const input = payload as Parameters<typeof createCarBooking>[0]
      const result = await createCarBooking(input)
      return result.ok
        ? { ok: true, reservationId: result.reservationId, priceTnd: result.totalTnd }
        : { ok: false, error: result.error }
    }
    case "network": {
      const input = payload as Parameters<typeof createNetworkProductBooking>[0]
      const result = await createNetworkProductBooking(input)
      return result.ok
        ? { ok: true, reservationId: result.reservationId }
        : { ok: false, error: result.error }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* confirmJourneyLine                                                        */
/* -------------------------------------------------------------------------- */

const confirmJourneyLineSchema = z.object({
  lineId: z.string().uuid(),
})

export type ConfirmJourneyLineResult =
  | { ok: true; reservationId: string; alreadyConfirmed?: boolean }
  | { ok: false; error: string; code?: string }

export async function confirmJourneyLine(raw: z.infer<typeof confirmJourneyLineSchema>): Promise<ConfirmJourneyLineResult> {
  const parsed = confirmJourneyLineSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrée invalide." }
  if (!process.env.DATABASE_URL) return { ok: false, error: "Base de données non configurée" }

  const actor = await resolveActorForExistingRecord()
  if (!actor.ok) return actor
  const tenantCtx = { agencyId: actor.agencyId, userId: actor.userId, isSuperAdmin: actor.isSuperAdmin }

  // --- Étape 1/3 : CAS pending|failed → processing, transaction COMMITTÉE seule ---
  const cas = await withTenantContext(tenantCtx, (tx) => casLineToProcessingCore(tx, { lineId: parsed.data.lineId }))
  if (cas.outcome === "not_found") return { ok: false, error: "Ligne introuvable ou non autorisée." }
  if (cas.outcome === "already_processing") {
    return { ok: false, error: "Confirmation déjà en cours pour cette ligne — réessayez dans quelques instants.", code: "ALREADY_PROCESSING" }
  }
  if (cas.outcome === "already_confirmed") {
    return { ok: true, reservationId: cas.line.reservationId ?? "", alreadyConfirmed: true }
  }
  const line = cas.line // outcome === "started"

  // --- Étape 2/3 : moteur réel, HORS de toute transaction ici ---
  let outcome: DispatchOutcome
  try {
    outcome = await dispatchJourneyLine(line.module as JourneyWiredModule, line.payload)
  } catch (err) {
    outcome = { ok: false, error: err instanceof Error ? err.message : "Erreur interne du moteur de réservation" }
  }

  // --- Étape 3/3 : enregistrement du résultat, transaction SÉPARÉE ---
  await withTenantContext(tenantCtx, (tx) => recordLineOutcomeCore(tx, { lineId: line.id, outcome }))

  if (!outcome.ok) return { ok: false, error: outcome.error }
  return { ok: true, reservationId: outcome.reservationId }
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                    */
/* -------------------------------------------------------------------------- */

const getJourneySchema = z.object({ journeyId: z.string().uuid() })

export async function getJourney(raw: z.infer<typeof getJourneySchema>) {
  const parsed = getJourneySchema.safeParse(raw)
  if (!parsed.success) return null
  if (!process.env.DATABASE_URL) return null
  const actor = await resolveActorForExistingRecord()
  if (!actor.ok) return null
  return withTenantContext(
    { agencyId: actor.agencyId, userId: actor.userId, isSuperAdmin: actor.isSuperAdmin },
    (tx) => getJourneyWithLinesCore(tx, { journeyId: parsed.data.journeyId }),
  )
}

const listJourneysSchema = z.object({ agencyId: z.string().uuid().optional() })

export async function listMyJourneys(raw: z.infer<typeof listJourneysSchema> = {}) {
  const parsed = listJourneysSchema.safeParse(raw)
  if (!parsed.success) return []
  if (!process.env.DATABASE_URL) return []
  const actor = await resolveActorContext(parsed.data.agencyId)
  if (!actor.ok) return []
  return withTenantContext(
    { agencyId: actor.isSuperAdmin ? null : actor.agencyId, userId: actor.userId, isSuperAdmin: actor.isSuperAdmin },
    (tx) => listJourneysForAgencyCore(tx, { agencyId: actor.agencyId }),
  )
}
