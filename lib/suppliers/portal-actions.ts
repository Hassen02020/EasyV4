"use server"

/**
 * NETWORK-01 (Phase 35 suite) — invitation réelle des utilisateurs portail
 * fournisseur + création de nœud, gated super_admin (V1 staff-only, aucune
 * session self-service fournisseur pour l'instant).
 *
 * `createSupplierNode`/`listSupplierNodes`/etc. ci-dessus existaient déjà
 * (lecture + insert brut, sans RBAC intégrée) mais n'avaient AUCUN appelant
 * autorisé (seul `app/(internal)/admin/suppliers/nodes/page.tsx`, en lecture
 * seule, les utilisait). Les actions ci-dessous sont les premières à
 * réellement écrire dans `supplier_nodes`/`supplier_portal_users` avec une
 * vérification super_admin — même pattern que createStaffUser/
 * createPartnerAgent : invitation Supabase Auth réelle (jamais un token
 * custom différé) → `userId` réel obtenu immédiatement → insert profil +
 * trace dans la même transaction → rollback (suppression du compte Auth) si
 * l'insert échoue.
 *
 * Trace : `supplier_nodes`/`supplier_portal_users` sont des entités
 * PLATEFORME (pas de agencyId, comme `suppliers` lui-même) — la table
 * `audit_events` a une FK `agency_id` NOT NULL et ne convient donc pas ici.
 * Réutilise `supplier_logs` (déjà scopée `supplierId`, sans agence),
 * conforme au principe REUSE plutôt que d'inventer une table d'audit
 * plateforme séparée.
 *
 * Note schéma : le commentaire sur `supplierPortalUsers.userId` ("jamais nul
 * une fois l'invitation acceptée") suggérait à l'origine un flux à token
 * différé (les colonnes `invitationToken`/`invitationTokenExpiresAt`
 * existent toujours mais restent NON utilisées ici, par cohérence avec le
 * pattern déjà établi 3 fois dans ce codebase) — `userId` est déjà réel dès
 * l'invitation, `acceptedAt` reste `null` jusqu'à la première connexion.
 */

import { revalidatePath } from "next/cache"
import { withSystemContext, withTenantContext } from "@/lib/db/tenant-context"
import { supplierNodes, supplierPortalUsers, suppliers, supplierLogs } from "@/lib/db/schema"
import { eq, desc, asc } from "drizzle-orm"
import { z } from "zod"
import { createServerSupabase, createServiceRoleSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import type {
  SupplierNode,
  NewSupplierNode,
  SupplierOnboardingStatus,
  SupplierPortalUserRole,
} from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

export type SupplierNodeRow = Pick<
  SupplierNode,
  | "id"
  | "supplierId"
  | "slug"
  | "displayName"
  | "shortDescription"
  | "contactEmail"
  | "contactCountry"
  | "modules"
  | "onboardingStatus"
  | "portalEnabled"
  | "logoUrl"
  | "invitedByUserId"
  | "activatedAt"
  | "createdAt"
>

export async function listSupplierNodes(): Promise<SupplierNodeRow[]> {
  return withSystemContext((db) =>
    db
      .select({
        id: supplierNodes.id,
        supplierId: supplierNodes.supplierId,
        slug: supplierNodes.slug,
        displayName: supplierNodes.displayName,
        shortDescription: supplierNodes.shortDescription,
        contactEmail: supplierNodes.contactEmail,
        contactCountry: supplierNodes.contactCountry,
        modules: supplierNodes.modules,
        onboardingStatus: supplierNodes.onboardingStatus,
        portalEnabled: supplierNodes.portalEnabled,
        logoUrl: supplierNodes.logoUrl,
        invitedByUserId: supplierNodes.invitedByUserId,
        activatedAt: supplierNodes.activatedAt,
        createdAt: supplierNodes.createdAt,
      })
      .from(supplierNodes)
      .orderBy(asc(supplierNodes.displayName)),
  )
}

export async function getSupplierNodeBySlug(slug: string): Promise<SupplierNode | null> {
  const rows = await withSystemContext((db) =>
    db.select().from(supplierNodes).where(eq(supplierNodes.slug, slug)).limit(1),
  )
  return rows[0] ?? null
}

export async function getSupplierNodeBySupplierId(supplierId: string): Promise<SupplierNode | null> {
  const rows = await withSystemContext((db) =>
    db.select().from(supplierNodes).where(eq(supplierNodes.supplierId, supplierId)).limit(1),
  )
  return rows[0] ?? null
}

/* -------------------------------------------------------------------------- */
/* Write                                                                       */
/* -------------------------------------------------------------------------- */

export async function createSupplierNode(
  data: Omit<NewSupplierNode, "id" | "createdAt" | "updatedAt">,
): Promise<SupplierNode> {
  const rows = await withSystemContext((db) =>
    db.insert(supplierNodes).values(data).returning(),
  )
  if (!rows[0]) throw new Error("createSupplierNode: insert returned no row")
  return rows[0]
}

export async function updateSupplierNodeStatus(
  nodeId: string,
  status: SupplierOnboardingStatus,
  portalEnabled?: boolean,
): Promise<void> {
  const patch: Partial<NewSupplierNode> = {
    onboardingStatus: status,
    updatedAt: new Date(),
  }
  if (status === "active") {
    patch.activatedAt = new Date()
    patch.portalEnabled = portalEnabled ?? true
  }
  if (portalEnabled !== undefined) {
    patch.portalEnabled = portalEnabled
  }
  await withSystemContext((db) =>
    db.update(supplierNodes).set(patch).where(eq(supplierNodes.id, nodeId)),
  )
}

/* -------------------------------------------------------------------------- */
/* Portal users                                                                */
/* -------------------------------------------------------------------------- */

export async function listPortalUsersForNode(nodeId: string) {
  return withSystemContext((db) =>
    db
      .select()
      .from(supplierPortalUsers)
      .where(eq(supplierPortalUsers.supplierNodeId, nodeId))
      .orderBy(asc(supplierPortalUsers.role), desc(supplierPortalUsers.invitedAt)),
  )
}

/* -------------------------------------------------------------------------- */
/* Actions gated super_admin (écriture réelle)                                */
/* -------------------------------------------------------------------------- */

async function requireSuperAdmin() {
  if (!process.env.DATABASE_URL) return { ok: false as const, error: "Base de données non configurée" }
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || profile.role !== "super_admin") {
    return { ok: false as const, error: "Réservé aux super_admin." }
  }
  return { ok: true as const, user, profile }
}

const createNodeInputSchema = z.object({
  supplierId: z.string().uuid(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug invalide (minuscules, chiffres, tirets)"),
  displayName: z.string().trim().min(1).max(200),
  shortDescription: z.string().trim().max(2000).optional(),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(320).optional(),
  contactCountry: z.string().trim().length(3).optional(),
  modules: z.array(z.string()).default([]),
})

export type CreateSupplierNodeResult = { ok: true; nodeId: string } | { ok: false; error: string }

/**
 * Crée un nœud fournisseur à partir d'une ligne `suppliers` EXISTANTE
 * (aucune action de création de fournisseur technique n'existe dans ce
 * codebase — hors périmètre NETWORK-01, gap pré-existant documenté tel
 * quel). `suppliers.id` doit être unique par nœud (contrainte DB
 * `supplier_nodes_supplier_uniq`).
 */
export async function createSupplierNodeAction(
  raw: z.infer<typeof createNodeInputSchema>,
): Promise<CreateSupplierNodeResult> {
  const parsed = createNodeInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  const outcome = await withTenantContext(
    { agencyId: null, userId: user.id, isSuperAdmin: true },
    async (tx) => {
      const [supplier] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(eq(suppliers.id, input.supplierId))
        .limit(1)
      if (!supplier) return { ok: false as const, error: "Fournisseur introuvable." }

      const [existing] = await tx
        .select({ id: supplierNodes.id })
        .from(supplierNodes)
        .where(eq(supplierNodes.supplierId, input.supplierId))
        .limit(1)
      if (existing) return { ok: false as const, error: "Ce fournisseur a déjà un nœud réseau." }

      const [node] = await tx
        .insert(supplierNodes)
        .values({
          supplierId: input.supplierId,
          slug: input.slug,
          displayName: input.displayName,
          shortDescription: input.shortDescription,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactCountry: input.contactCountry,
          modules: input.modules,
          invitedByUserId: user.id,
        })
        .returning({ id: supplierNodes.id })
      if (!node) return { ok: false as const, error: "Échec de la création du nœud." }

      await tx.insert(supplierLogs).values({
        supplierId: input.supplierId,
        type: "portal",
        level: "info",
        message: `Nœud réseau créé (${input.displayName}) par ${user.id}`,
        details: { nodeId: node.id, slug: input.slug, actorUserId: user.id },
      })

      return { ok: true as const, nodeId: node.id }
    },
  )

  if (outcome.ok) revalidatePath("/admin/suppliers/nodes")
  return outcome
}

const inviteInputSchema = z.object({
  nodeId: z.string().uuid(),
  email: z.string().trim().email().max(320),
  role: z.enum(["owner", "manager", "staff"]),
})

export type InviteSupplierPortalUserResult = { ok: true; userId: string } | { ok: false; error: string }

/**
 * Invite un utilisateur portail pour un nœud fournisseur — même pattern
 * qu'createPartnerAgent (invitation Supabase Auth réelle, `userId` obtenu
 * immédiatement, rollback si l'insert profil échoue).
 */
export async function inviteSupplierPortalUser(
  raw: z.infer<typeof inviteInputSchema>,
): Promise<InviteSupplierPortalUserResult> {
  const parsed = inviteInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: "Entrée invalide : " + parsed.error.errors.map((e) => e.message).join(", ") }
  }
  const input = parsed.data

  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }
  const { user } = auth

  const node = await withSystemContext((db) =>
    db
      .select({ id: supplierNodes.id, supplierId: supplierNodes.supplierId, displayName: supplierNodes.displayName })
      .from(supplierNodes)
      .where(eq(supplierNodes.id, input.nodeId))
      .limit(1),
  )
  if (!node[0]) return { ok: false, error: "Nœud fournisseur introuvable." }

  const admin = createServiceRoleSupabase()
  const invited = await admin.auth.admin.inviteUserByEmail(input.email, {
    data: { supplierNodeId: input.nodeId, supplierPortalRole: input.role },
  })
  if (invited.error || !invited.data.user) {
    return { ok: false, error: `Échec de l'invitation : ${invited.error?.message ?? "erreur inconnue"}` }
  }
  const newUserId = invited.data.user.id

  try {
    await withTenantContext(
      { agencyId: null, userId: user.id, isSuperAdmin: true },
      async (tx) => {
        await tx.insert(supplierPortalUsers).values({
          supplierNodeId: input.nodeId,
          userId: newUserId,
          role: input.role as SupplierPortalUserRole,
          invitedEmail: input.email,
        })
        await tx.insert(supplierLogs).values({
          supplierId: node[0].supplierId,
          type: "portal",
          level: "info",
          message: `Utilisateur portail invité (${input.email}, ${input.role}) par ${user.id}`,
          details: { nodeId: input.nodeId, invitedUserId: newUserId, email: input.email, role: input.role, actorUserId: user.id },
        })
      },
    )
  } catch (err) {
    await admin.auth.admin.deleteUser(newUserId).catch(() => {})
    const message = err instanceof Error ? err.message : "Erreur inconnue"
    return { ok: false, error: `Compte invité mais profil non créé (annulé) : ${message}` }
  }

  revalidatePath(`/admin/suppliers/nodes/${input.nodeId}`)
  return { ok: true, userId: newUserId }
}
