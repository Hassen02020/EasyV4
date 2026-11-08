/**
 * SUPPLIER-STATUS-CHECK-01 — consultation, en LECTURE SEULE, de l'état réel
 * d'une réservation hôtel chez myGo, réservée au super_admin.
 *
 * Garde-fous :
 *  - rôle super_admin vérifié ici, côté serveur (refus sans aucun appel) ;
 *  - la référence myGo et l'agence sont lues EN BASE à partir de l'identifiant
 *    de réservation Easy2Book, jamais fournies par le navigateur ;
 *  - un seul appel fournisseur : BookingList filtré sur cette référence
 *    (jamais BookingCreation ni BookingCancellation) ;
 *  - compte myGo de l'agence de la réservation (même résolution que les
 *    parcours de réservation ; repli sur le compte global s'il n'y en a pas) ;
 *  - aucun identifiant fournisseur renvoyé ni journalisé ; message d'erreur
 *    fournisseur réduit à un code ;
 *  - aucune modification de la réservation ni des paiements ; une trace
 *    d'audit par consultation (qui, quand, référence, état lu).
 */
import { eq, sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import { auditEvents, reservationHotel, reservations } from "@/lib/db/schema"
import { logger } from "@/lib/logger"

/** audit_events.action est varchar(32). */
export const SUPPLIER_STATUS_AUDIT_ACTION = "supplier.status_checked"

/** Sous-ensemble du client myGo utilisé ici : lecture uniquement. */
export interface SupplierStatusClient {
  listBookings(filters: { booking: number }): Promise<
    Array<{
      Id: number
      State?: string
      Created?: string
      Validated?: string | null
      Cancelled?: string | null
      TotalPrice?: number | string
      Fee?: number | string | null
      Currency?: string
      CheckIn?: string
      CheckOut?: string
      Hotel?: { Id?: number; Name?: string }
    }>
  >
}

export interface SupplierBookingStatus {
  supplierBookingRef: string
  state: string | null
  createdAt: string | null
  validatedAt: string | null
  cancelledAt: string | null
  totalPrice: string | null
  fee: string | null
  currency: string | null
  hotelName: string | null
  checkIn: string | null
  checkOut: string | null
}

export type SupplierStatusResult =
  | { ok: true; found: true; publicRef: string; status: SupplierBookingStatus }
  | { ok: true; found: false; publicRef: string; supplierBookingRef: string }
  | {
      ok: false
      code:
        | "FORBIDDEN"
        | "NOT_FOUND"
        | "NOT_APPLICABLE"
        | "SUPPLIER_UNREACHABLE"
      error: string
    }

export interface SupplierStatusActor {
  userId: string
  role: string
}

export type ResolveSupplierClient = (
  agencyId: string,
  actorUserId: string,
) => Promise<SupplierStatusClient>

const str = (v: unknown): string | null =>
  v === undefined || v === null || v === "" ? null : String(v)

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code
    if (typeof c === "string" || typeof c === "number") return String(c)
  }
  return err instanceof Error ? err.name : "unknown"
}

async function audit(
  agencyId: string,
  actorUserId: string,
  reservationId: string,
  diff: Record<string, unknown>,
) {
  try {
    await withSystemContext((tx) =>
      tx.insert(auditEvents).values({
        agencyId,
        actorUserId,
        entityType: "reservation",
        entityId: reservationId,
        action: SUPPLIER_STATUS_AUDIT_ACTION,
        diff,
      }),
    )
  } catch (err) {
    logger.error("[supplier-status] trace d'audit impossible", {
      reservationId,
      err: errorCode(err),
    })
  }
}

export async function checkSupplierBookingStatusCore(input: {
  reservationId: string
  actor: SupplierStatusActor
  resolveClient: ResolveSupplierClient
}): Promise<SupplierStatusResult> {
  if (input.actor.role !== "super_admin") {
    return {
      ok: false,
      code: "FORBIDDEN",
      error: "Réservé au super_admin.",
    }
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      input.reservationId,
    )
  ) {
    return { ok: false, code: "NOT_FOUND", error: "Réservation introuvable." }
  }

  const [row] = await withSystemContext((tx) =>
    tx
      .select({
        id: reservations.id,
        agencyId: reservations.agencyId,
        module: reservations.module,
        publicRef: reservations.publicRef,
        providerBookingId: reservationHotel.providerBookingId,
      })
      .from(reservations)
      .leftJoin(
        reservationHotel,
        eq(reservationHotel.reservationId, reservations.id),
      )
      .where(eq(reservations.id, sql`${input.reservationId}::uuid`)),
  )
  if (!row) {
    return { ok: false, code: "NOT_FOUND", error: "Réservation introuvable." }
  }
  const ref = row.providerBookingId?.trim() ?? ""
  if (row.module !== "hotel" || !/^\d+$/.test(ref)) {
    return {
      ok: false,
      code: "NOT_APPLICABLE",
      error:
        "Vérification disponible uniquement pour une réservation hôtel Tunisie avec une référence myGo.",
    }
  }

  let items: Awaited<ReturnType<SupplierStatusClient["listBookings"]>>
  try {
    const client = await input.resolveClient(row.agencyId, input.actor.userId)
    items = await client.listBookings({ booking: Number(ref) })
  } catch (err) {
    const code = errorCode(err)
    await audit(row.agencyId, input.actor.userId, row.id, {
      publicRef: row.publicRef,
      supplierBookingRef: ref,
      outcome: "supplier_unreachable",
      errorCode: code,
    })
    return {
      ok: false,
      code: "SUPPLIER_UNREACHABLE",
      error: `Fournisseur injoignable ou réponse invalide (code ${code}). Aucun état n'est affiché.`,
    }
  }

  const item = items.find((b) => String(b.Id) === ref)
  if (!item) {
    await audit(row.agencyId, input.actor.userId, row.id, {
      publicRef: row.publicRef,
      supplierBookingRef: ref,
      outcome: "not_found_at_supplier",
    })
    return {
      ok: true,
      found: false,
      publicRef: row.publicRef,
      supplierBookingRef: ref,
    }
  }

  const status: SupplierBookingStatus = {
    supplierBookingRef: ref,
    state: str(item.State),
    createdAt: str(item.Created),
    validatedAt: str(item.Validated),
    cancelledAt: str(item.Cancelled),
    totalPrice: str(item.TotalPrice),
    fee: str(item.Fee),
    currency: str(item.Currency),
    hotelName: str(item.Hotel?.Name),
    checkIn: str(item.CheckIn),
    checkOut: str(item.CheckOut),
  }
  await audit(row.agencyId, input.actor.userId, row.id, {
    publicRef: row.publicRef,
    outcome: "found",
    ...status,
  })
  return { ok: true, found: true, publicRef: row.publicRef, status }
}
