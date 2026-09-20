"use server"

/**
 * Création manuelle d'un client B2C par le staff (`/admin/b2c/clients`) —
 * jusqu'ici le bouton "Nouveau client" était `disabled` ("Pas encore
 * disponible"). Contrairement à un client créé via un parcours de réservation
 * guest (`resolveOrCreateLinkedCustomer`, lib/booking/customer-identity.ts),
 * cette création est un acte staff explicite (ex. client connu par téléphone,
 * pas encore de réservation) — même table `customers`, jamais un second
 * mécanisme d'identité. Toujours scopée à l'agence du staff appelant, jamais
 * un agencyId fourni par le client (même frontière que loadClients() dans la
 * page).
 */

import { revalidatePath } from "next/cache"
import { eq, and } from "drizzle-orm"
import { z } from "zod"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers, auditEvents } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { logger } from "@/lib/logger"

const ALLOWED_ROLES = ["super_admin", "manager", "agent_resa"] as const

const createCustomerInputSchema = z.object({
  civility: z.enum(["M", "Mme", "Mlle"]).optional().or(z.literal("")),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  civicId: z.string().trim().max(64).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  country: z.string().trim().max(64).optional().or(z.literal("")),
})

export type CreateCustomerResult =
  | { ok: true; customerId: string }
  | { ok: false; error: string }

export async function createCustomer(
  raw: z.infer<typeof createCustomerInputSchema>,
): Promise<CreateCustomerResult> {
  const parsed = createCustomerInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !(ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    return { ok: false, error: "Votre rôle n'est pas autorisé à créer un client." }
  }

  try {
    const customerId = await withTenantContext(
      { agencyId: profile.agencyId, userId: user.id, isSuperAdmin: false },
      async (tx) => {
        // Évite un doublon silencieux si le client existe déjà dans cette
        // agence (même email) — même règle de correspondance que
        // resolveOrCreateLinkedCustomer (agencyId + email exact).
        if (input.email) {
          const [existing] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.agencyId, profile.agencyId), eq(customers.email, input.email)))
            .limit(1)
          if (existing) throw new Error("DUPLICATE_EMAIL")
        }

        const [created] = await tx
          .insert(customers)
          .values({
            agencyId: profile.agencyId,
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
          agencyId: profile.agencyId,
          actorUserId: user.id,
          entityType: "customer",
          entityId: created.id,
          action: "customer.created",
          diff: { firstName: input.firstName, lastName: input.lastName, email: input.email || null, via: "staff" },
        })

        return created.id
      },
    )

    revalidatePath("/admin/b2c/clients")
    logger.info("[b2c-clients-actions] customer created", { customerId, actorId: user.id })
    return { ok: true, customerId }
  } catch (err) {
    if (err instanceof Error && err.message === "DUPLICATE_EMAIL") {
      return { ok: false, error: "Un client avec cet email existe déjà dans votre agence." }
    }
    logger.error("[b2c-clients-actions] createCustomer failed", {
      err: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

/**
 * Édition d'une fiche client B2C — jusqu'ici le bouton "Modifier" de
 * `/admin/b2c/clients` était `disabled` ("Pas encore disponible"). Même
 * scoping agence que createCustomer : `customerId` doit appartenir à
 * l'agence du staff appelant, jamais vérifié côté client.
 */
const updateCustomerInputSchema = z.object({
  customerId: z.string().uuid(),
  civility: z.enum(["M", "Mme", "Mlle"]).optional().or(z.literal("")),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  civicId: z.string().trim().max(64).optional().or(z.literal("")),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  country: z.string().trim().max(64).optional().or(z.literal("")),
})

export type UpdateCustomerResult = { ok: true } | { ok: false; error: string }

export async function updateCustomer(
  raw: z.infer<typeof updateCustomerInputSchema>,
): Promise<UpdateCustomerResult> {
  const parsed = updateCustomerInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "Base de données non configurée" }
  }

  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !(ALLOWED_ROLES as readonly string[]).includes(profile.role)) {
    return { ok: false, error: "Votre rôle n'est pas autorisé à modifier un client." }
  }

  try {
    await withTenantContext(
      { agencyId: profile.agencyId, userId: user.id, isSuperAdmin: false },
      async (tx) => {
        // withTenantContext (RLS) garantit déjà le scoping agence — cette
        // clause explicite évite en plus un UPDATE silencieux "0 ligne"
        // indiscernable d'un succès si le client n'existe pas dans cette agence.
        const [existing] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, input.customerId), eq(customers.agencyId, profile.agencyId)))
          .limit(1)
        if (!existing) throw new Error("NOT_FOUND")

        if (input.email) {
          const [duplicate] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.agencyId, profile.agencyId), eq(customers.email, input.email)))
            .limit(1)
          if (duplicate && duplicate.id !== input.customerId) throw new Error("DUPLICATE_EMAIL")
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
          agencyId: profile.agencyId,
          actorUserId: user.id,
          entityType: "customer",
          entityId: input.customerId,
          action: "customer.updated",
          diff: { firstName: input.firstName, lastName: input.lastName, email: input.email || null },
        })
      },
    )

    revalidatePath("/admin/b2c/clients")
    revalidatePath(`/admin/b2c/clients/${input.customerId}`)
    logger.info("[b2c-clients-actions] customer updated", { customerId: input.customerId, actorId: user.id })
    return { ok: true }
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return { ok: false, error: "Client introuvable dans votre agence." }
    }
    if (err instanceof Error && err.message === "DUPLICATE_EMAIL") {
      return { ok: false, error: "Un autre client avec cet email existe déjà dans votre agence." }
    }
    logger.error("[b2c-clients-actions] updateCustomer failed", {
      err: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}
