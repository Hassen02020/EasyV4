/**
 * Server Actions — Allotements Omra (dates de départ, stocks & prix par date)
 *
 * Gère les `omra_allotments` d'un programme depuis le back-office :
 *   - liste des dates de départ
 *   - ajout d'une date (capacité + prix spécifique optionnel)
 *   - suppression d'une date
 *
 * Le contrôle de rôle réutilise la garde partagée `requireOmraEditor`.
 */

"use server"

import { revalidatePath } from "next/cache"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import { getDb } from "@/lib/db/client"
import { omraAllotments, omraPackages } from "@/lib/db/schema"
import type { OmraAllotment } from "@/lib/db/schema/omra"
import { requireOmraEditor } from "@/lib/omra/guard"

const allotmentSchema = z.object({
  packageId: z.string().uuid("Programme invalide."),
  departureDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date de départ invalide."),
  totalCapacity: z.coerce
    .number()
    .int("Capacité invalide.")
    .min(1, "La capacité doit être d'au moins 1 place.")
    .max(2000),
  overridePrice: z.coerce
    .number()
    .min(0, "Prix invalide.")
    .optional()
    .nullable(),
  bookingDeadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date limite invalide.")
    .optional()
    .nullable(),
})

export type AllotmentInput = z.input<typeof allotmentSchema>

export type AllotmentActionResult =
  | { ok: true; data: OmraAllotment }
  | { ok: false; error: string }

/** Liste les allotements d'un programme (tous statuts), triés par date. */
export async function getProgramAllotments(
  packageId: string,
): Promise<OmraAllotment[]> {
  try {
    const db = getDb()
    return await db
      .select()
      .from(omraAllotments)
      .where(eq(omraAllotments.packageId, packageId))
      .orderBy(asc(omraAllotments.departureDate))
  } catch {
    return []
  }
}

/** Ajoute une date de départ (allotement) à un programme. */
export async function createOmraAllotment(
  input: AllotmentInput,
): Promise<AllotmentActionResult> {
  const auth = await requireOmraEditor()
  if ("error" in auth) return { ok: false, error: auth.error }

  const parsed = allotmentSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join(" · "),
    }
  }
  const data = parsed.data

  try {
    const db = getDb()

    // Le programme doit appartenir à l'agence de l'éditeur.
    const owner = await db
      .select({ id: omraPackages.id })
      .from(omraPackages)
      .where(
        and(
          eq(omraPackages.id, data.packageId),
          eq(omraPackages.agencyId, auth.agencyId),
        ),
      )
      .limit(1)
    if (owner.length === 0) {
      return { ok: false, error: "Programme introuvable pour votre agence." }
    }

    const [row] = await db
      .insert(omraAllotments)
      .values({
        packageId: data.packageId,
        departureDate: data.departureDate,
        totalCapacity: data.totalCapacity,
        availableCount: data.totalCapacity,
        overridePrice:
          data.overridePrice != null ? data.overridePrice.toFixed(3) : null,
        bookingDeadline: data.bookingDeadline ?? null,
        status: "active",
      })
      .returning()

    if (!row) return { ok: false, error: "Insertion impossible." }

    revalidatePath(`/admin/products/omra/${data.packageId}`)
    revalidatePath("/omra")
    return { ok: true, data: row }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ajout impossible."
    return { ok: false, error: message }
  }
}

/** Supprime une date de départ (allotement). */
export async function deleteOmraAllotment(
  id: string,
  packageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOmraEditor()
  if ("error" in auth) return { ok: false, error: auth.error }

  try {
    const db = getDb()
    await db.delete(omraAllotments).where(eq(omraAllotments.id, id))

    revalidatePath(`/admin/products/omra/${packageId}`)
    revalidatePath("/omra")
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Suppression impossible."
    return { ok: false, error: message }
  }
}
