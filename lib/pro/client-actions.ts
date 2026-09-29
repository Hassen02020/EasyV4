"use server"

/**
 * R3-01 (audit Phase 0) : création/édition d'une fiche client par une agence
 * partenaire — `/pro/clients` n'était qu'un annuaire lecture seule
 * (`loadPartnerClients`), un client n'existait qu'indirectement via le
 * find-or-create caché dans chaque flux de réservation
 * (`resolveOrCreateLinkedCustomer`, lib/booking/customer-identity.ts).
 *
 * Même table `customers`, même motif que `createCustomer`/`updateCustomer`
 * (lib/admin/b2c-clients-actions.ts, côté staff OTA) — mais gate différent :
 * "clients.create"/"clients.edit" sont déjà dans la baseline `partner_owner`
 * (lib/auth/permissions.ts) et délégables à un `partner_agent` via le
 * système de grants existant (getEffectivePermission combine déjà
 * override explicite puis baseline — pas besoin d'un grant "staff.*"
 * comme pour l'invitation de compte, R2-05).
 */

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { getEffectivePermission } from "@/lib/auth/permissions"

const clientInputSchema = z.object({
  civility: z.enum(["M", "Mme", "Mlle"]).optional().or(z.literal("")),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  civicId: z.string().trim().max(64).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  country: z.string().trim().max(64).optional().or(z.literal("")),
})

export type CreatePartnerClientResult =
  | { ok: true; customerId: string }
  | { ok: false; error: string }

export async function createPartnerClient(
  raw: z.infer<typeof clientInputSchema>,
): Promise<CreatePartnerClientResult> {
  const parsed = clientInputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Entrée invalide : " +
        parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  const input = parsed.data

  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) return { ok: false, error: "Profil partenaire introuvable" }

  const authorized = await getEffectivePermission({
    agencyId: profile.agency.id,
    userId: user.id,
    role: profile.role,
    permission: "clients.create",
  })
  if (!authorized) {
    return {
      ok: false,
      error: "Vous n'êtes pas autorisé à créer un client pour votre agence.",
    }
  }

  try {
    const customerId = await withTenantContext(
      { agencyId: profile.agency.id, userId: user.id, isSuperAdmin: false },
      async (tx) => {
        if (input.email) {
          const [existing] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(
              and(
                eq(customers.agencyId, profile.agency.id),
                eq(customers.email, input.email),
              ),
            )
            .limit(1)
          if (existing) throw new Error("DUPLICATE_EMAIL")
        }

        const [created] = await tx
          .insert(customers)
          .values({
            agencyId: profile.agency.id,
            civility: input.civility || undefined,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email || undefined,
            phone: input.phone || undefined,
            civicId: input.civicId || undefined,
            city: input.city || undefined,
            country: input.country || undefined,
          })
          .returning({ id: customers.id })

        await tx.insert(auditEvents).values({
          agencyId: profile.agency.id,
          actorUserId: user.id,
          entityType: "customer",
          entityId: created.id,
          action: "customer.created",
          diff: {
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email || null,
            via: "partner",
          },
        })

        return created.id
      },
    )

    revalidatePath("/pro/clients")
    return { ok: true, customerId }
  } catch (err) {
    if (err instanceof Error && err.message === "DUPLICATE_EMAIL") {
      return {
        ok: false,
        error: "Un client avec cet email existe déjà dans votre agence.",
      }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    }
  }
}

const updateInputSchema = clientInputSchema.extend({
  customerId: z.string().uuid(),
})

export type UpdatePartnerClientResult =
  | { ok: true }
  | { ok: false; error: string }

export async function updatePartnerClient(
  raw: z.infer<typeof updateInputSchema>,
): Promise<UpdatePartnerClientResult> {
  const parsed = updateInputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Entrée invalide : " +
        parsed.error.errors.map((e) => e.message).join(", "),
    }
  }
  const input = parsed.data

  if (!process.env.DATABASE_URL)
    return { ok: false, error: "Base de données non configurée" }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) return { ok: false, error: "Profil partenaire introuvable" }

  const authorized = await getEffectivePermission({
    agencyId: profile.agency.id,
    userId: user.id,
    role: profile.role,
    permission: "clients.edit",
  })
  if (!authorized) {
    return {
      ok: false,
      error: "Vous n'êtes pas autorisé à modifier un client de votre agence.",
    }
  }

  try {
    await withTenantContext(
      { agencyId: profile.agency.id, userId: user.id, isSuperAdmin: false },
      async (tx) => {
        const [existing] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.id, input.customerId),
              eq(customers.agencyId, profile.agency.id),
            ),
          )
          .limit(1)
        if (!existing) throw new Error("NOT_FOUND")

        if (input.email) {
          const [duplicate] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(
              and(
                eq(customers.agencyId, profile.agency.id),
                eq(customers.email, input.email),
              ),
            )
            .limit(1)
          if (duplicate && duplicate.id !== input.customerId)
            throw new Error("DUPLICATE_EMAIL")
        }

        await tx
          .update(customers)
          .set({
            civility: input.civility || null,
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email || null,
            phone: input.phone || null,
            civicId: input.civicId || null,
            city: input.city || null,
            country: input.country || null,
          })
          .where(eq(customers.id, input.customerId))

        await tx.insert(auditEvents).values({
          agencyId: profile.agency.id,
          actorUserId: user.id,
          entityType: "customer",
          entityId: input.customerId,
          action: "customer.updated",
          diff: {
            firstName: input.firstName,
            lastName: input.lastName,
            email: input.email || null,
            via: "partner",
          },
        })
      },
    )

    revalidatePath("/pro/clients")
    return { ok: true }
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return { ok: false, error: "Client introuvable dans votre agence." }
    }
    if (err instanceof Error && err.message === "DUPLICATE_EMAIL") {
      return {
        ok: false,
        error: "Un autre client avec cet email existe déjà dans votre agence.",
      }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    }
  }
}
