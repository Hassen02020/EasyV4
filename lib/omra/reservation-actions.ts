/**
 * Server Actions — Traitement des réservations Omra (back-office)
 *
 * Actions métier agence exécutées en transaction DB (atomiques) :
 *   - confirmOmraReservation   : pending → confirmed (+ confirmed_at, stock)
 *   - cancelOmraReservation    : → cancelled (+ cancelled_at, restauration stock)
 *   - completeOmraReservation  : confirmed → completed
 *   - addOmraReservationNote   : ajoute une note interne (historique)
 *
 * Chaque action :
 *   - vérifie les permissions (requireOmraAgent : super_admin / manager / agent_resa)
 *   - verrouille la réservation + l'allotment (FOR UPDATE) → anti-concurrence
 *   - écrit un événement d'audit (historique)
 *   - déclenche les notifications (in_app + email client best-effort)
 */

"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getDb } from "@/lib/db/client"
import {
  reservations,
  reservationOmra,
  customers,
  omraAllotments,
  auditEvents,
} from "@/lib/db/schema"
import { requireOmraAgent } from "@/lib/omra/guard"
import {
  queueInAppNotification,
  dispatchNotification,
} from "@/lib/notifications/dispatch"

export type OmraActionResult = { ok: true } | { ok: false; error: string }

function revalidate(id: string) {
  revalidatePath("/admin/omra/reservations")
  revalidatePath(`/admin/omra/reservations/${id}`)
  revalidatePath("/admin")
}

/**
 * Charge et verrouille (FOR UPDATE) la réservation Omra + son extension.
 * Retourne null si introuvable / hors périmètre agence / pas Omra.
 */
async function lockReservation(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  agencyId: string,
  id: string,
) {
  const [row] = await tx
    .select({
      id: reservations.id,
      publicRef: reservations.publicRef,
      status: reservations.status,
      customerId: reservations.customerId,
      tndAmount: reservations.tndAmount,
      departureDate: reservationOmra.departureDate,
      packageId: reservationOmra.omraPackageId,
      pilgrims: reservationOmra.pilgrims,
    })
    .from(reservations)
    .leftJoin(
      reservationOmra,
      eq(reservationOmra.reservationId, reservations.id),
    )
    .where(
      and(
        eq(reservations.id, id),
        eq(reservations.agencyId, agencyId),
        eq(reservations.module, "omra"),
      ),
    )
    .limit(1)
    .for("update", { of: reservations })

  return row ?? null
}

async function getCustomerContact(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  customerId: string,
): Promise<{ email: string | null; phone: string | null; name: string }> {
  const [c] = await tx
    .select({
      email: customers.email,
      phone: customers.phone,
      firstName: customers.firstName,
      lastName: customers.lastName,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)
  return {
    email: c?.email ?? null,
    phone: c?.phone ?? null,
    name: `${c?.firstName ?? ""} ${c?.lastName ?? ""}`.trim(),
  }
}

/* -------------------------------------------------------------------------- */
/* Confirmer                                                                  */
/* -------------------------------------------------------------------------- */

export async function confirmOmraReservation(
  id: string,
): Promise<OmraActionResult> {
  const auth = await requireOmraAgent()
  if ("error" in auth) return { ok: false, error: auth.error }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Identifiant invalide." }
  }

  try {
    const db = getDb()
    const outcome = await db.transaction(async (tx) => {
      const res = await lockReservation(tx, auth.agencyId, id)
      if (!res) throw new Error("NOT_FOUND")
      if (res.status !== "pending") {
        throw new Error(
          `INVALID_STATUS:Seule une réservation en attente peut être confirmée (statut actuel : ${res.status}).`,
        )
      }

      const now = new Date()

      await tx
        .update(reservations)
        .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
        .where(eq(reservations.id, id))

      // Déplace le stock : réservé → confirmé (disponibilité inchangée).
      if (res.packageId && res.departureDate) {
        const [allotment] = await tx
          .select()
          .from(omraAllotments)
          .where(
            and(
              eq(omraAllotments.packageId, res.packageId),
              eq(omraAllotments.departureDate, res.departureDate),
            ),
          )
          .limit(1)
          .for("update")

        if (allotment) {
          await tx
            .update(omraAllotments)
            .set({
              reservedCount: Math.max(
                0,
                allotment.reservedCount - (res.pilgrims ?? 0),
              ),
              confirmedCount: allotment.confirmedCount + (res.pilgrims ?? 0),
              updatedAt: now,
            })
            .where(eq(omraAllotments.id, allotment.id))
        }
      }

      await tx.insert(auditEvents).values({
        agencyId: auth.agencyId,
        actorUserId: auth.userId,
        entityType: "reservation",
        entityId: id,
        action: "confirm",
        diff: { from: "pending", to: "confirmed", confirmedAt: now.toISOString() },
      })

      await queueInAppNotification(tx, {
        agencyId: auth.agencyId,
        type: "omra_reservation_confirmed",
        audience: "admin",
        title: `Réservation ${res.publicRef} confirmée`,
        entityType: "reservation",
        entityId: id,
      })

      const contact = await getCustomerContact(tx, res.customerId)
      return { publicRef: res.publicRef, contact }
    })

    // Email client (best-effort, hors transaction).
    await dispatchNotification({
      agencyId: auth.agencyId,
      type: "omra_reservation_confirmed",
      audience: "customer",
      channels: ["email"],
      title: `Votre réservation Omra ${outcome.publicRef} est confirmée`,
      body: `Bonjour ${outcome.contact.name},\n\nVotre réservation Omra (réf. ${outcome.publicRef}) est confirmée. Notre équipe vous recontactera pour finaliser les modalités.\n\nEasy2Book`,
      entityType: "reservation",
      entityId: id,
      recipient: {
        email: outcome.contact.email,
        phone: outcome.contact.phone,
      },
    })

    revalidate(id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapError(err) }
  }
}

/* -------------------------------------------------------------------------- */
/* Annuler                                                                    */
/* -------------------------------------------------------------------------- */

const cancelSchema = z.object({
  id: z.string().uuid("Identifiant invalide."),
  reason: z.string().trim().max(500).optional(),
})

export async function cancelOmraReservation(
  id: string,
  reason?: string,
): Promise<OmraActionResult> {
  const auth = await requireOmraAgent()
  if ("error" in auth) return { ok: false, error: auth.error }

  const parsed = cancelSchema.safeParse({ id, reason })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." }
  }

  try {
    const db = getDb()
    const outcome = await db.transaction(async (tx) => {
      const res = await lockReservation(tx, auth.agencyId, id)
      if (!res) throw new Error("NOT_FOUND")
      if (res.status !== "pending" && res.status !== "confirmed") {
        throw new Error(
          `INVALID_STATUS:Seule une réservation en attente ou confirmée peut être annulée (statut actuel : ${res.status}).`,
        )
      }

      const now = new Date()
      const wasConfirmed = res.status === "confirmed"

      await tx
        .update(reservations)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(eq(reservations.id, id))

      // Restauration du stock.
      if (res.packageId && res.departureDate) {
        const [allotment] = await tx
          .select()
          .from(omraAllotments)
          .where(
            and(
              eq(omraAllotments.packageId, res.packageId),
              eq(omraAllotments.departureDate, res.departureDate),
            ),
          )
          .limit(1)
          .for("update")

        if (allotment) {
          await tx
            .update(omraAllotments)
            .set({
              reservedCount: wasConfirmed
                ? allotment.reservedCount
                : Math.max(0, allotment.reservedCount - (res.pilgrims ?? 0)),
              confirmedCount: wasConfirmed
                ? Math.max(0, allotment.confirmedCount - (res.pilgrims ?? 0))
                : allotment.confirmedCount,
              availableCount: allotment.availableCount + (res.pilgrims ?? 0),
              updatedAt: now,
            })
            .where(eq(omraAllotments.id, allotment.id))
        }
      }

      await tx.insert(auditEvents).values({
        agencyId: auth.agencyId,
        actorUserId: auth.userId,
        entityType: "reservation",
        entityId: id,
        action: "cancel",
        diff: {
          from: res.status,
          to: "cancelled",
          cancelledAt: now.toISOString(),
          reason: parsed.data.reason ?? null,
          seatsRestored: (res.pilgrims ?? 0),
        },
      })

      await queueInAppNotification(tx, {
        agencyId: auth.agencyId,
        type: "omra_reservation_cancelled",
        audience: "admin",
        title: `Réservation ${res.publicRef} annulée`,
        body: parsed.data.reason ?? null,
        entityType: "reservation",
        entityId: id,
      })

      const contact = await getCustomerContact(tx, res.customerId)
      return { publicRef: res.publicRef, contact }
    })

    await dispatchNotification({
      agencyId: auth.agencyId,
      type: "omra_reservation_cancelled",
      audience: "customer",
      channels: ["email"],
      title: `Votre réservation Omra ${outcome.publicRef} a été annulée`,
      body: `Bonjour ${outcome.contact.name},\n\nVotre réservation Omra (réf. ${outcome.publicRef}) a été annulée.${reason ? `\n\nMotif : ${reason}` : ""}\n\nEasy2Book`,
      entityType: "reservation",
      entityId: id,
      recipient: {
        email: outcome.contact.email,
        phone: outcome.contact.phone,
      },
    })

    revalidate(id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapError(err) }
  }
}

/* -------------------------------------------------------------------------- */
/* Compléter                                                                  */
/* -------------------------------------------------------------------------- */

export async function completeOmraReservation(
  id: string,
): Promise<OmraActionResult> {
  const auth = await requireOmraAgent()
  if ("error" in auth) return { ok: false, error: auth.error }
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Identifiant invalide." }
  }

  try {
    const db = getDb()
    await db.transaction(async (tx) => {
      const res = await lockReservation(tx, auth.agencyId, id)
      if (!res) throw new Error("NOT_FOUND")
      if (res.status !== "confirmed") {
        throw new Error(
          `INVALID_STATUS:Seule une réservation confirmée peut être marquée complétée (statut actuel : ${res.status}).`,
        )
      }

      const now = new Date()
      await tx
        .update(reservations)
        .set({ status: "completed", updatedAt: now })
        .where(eq(reservations.id, id))

      await tx.insert(auditEvents).values({
        agencyId: auth.agencyId,
        actorUserId: auth.userId,
        entityType: "reservation",
        entityId: id,
        action: "complete",
        diff: { from: "confirmed", to: "completed" },
      })

      await queueInAppNotification(tx, {
        agencyId: auth.agencyId,
        type: "omra_reservation_completed",
        audience: "admin",
        title: `Réservation ${res.publicRef} complétée`,
        entityType: "reservation",
        entityId: id,
      })
    })

    revalidate(id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapError(err) }
  }
}

/* -------------------------------------------------------------------------- */
/* Note interne                                                               */
/* -------------------------------------------------------------------------- */

const noteSchema = z.object({
  id: z.string().uuid("Identifiant invalide."),
  note: z.string().trim().min(1, "La note ne peut pas être vide.").max(1000),
})

export async function addOmraReservationNote(
  id: string,
  note: string,
): Promise<OmraActionResult> {
  const auth = await requireOmraAgent()
  if ("error" in auth) return { ok: false, error: auth.error }

  const parsed = noteSchema.safeParse({ id, note })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." }
  }

  try {
    const db = getDb()
    await db.transaction(async (tx) => {
      const res = await lockReservation(tx, auth.agencyId, id)
      if (!res) throw new Error("NOT_FOUND")

      await tx.insert(auditEvents).values({
        agencyId: auth.agencyId,
        actorUserId: auth.userId,
        entityType: "reservation",
        entityId: id,
        action: "note",
        diff: { note: parsed.data.note },
      })
    })

    revalidate(id)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapError(err) }
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function mapError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === "NOT_FOUND") return "Réservation introuvable."
  if (msg.startsWith("INVALID_STATUS:")) return msg.slice("INVALID_STATUS:".length)
  console.error("[omra reservation-action]", msg)
  return "Erreur interne. Réessayez."
}
