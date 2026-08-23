/**
 * Résolution de permission effective (Phase 22 — modèle de délégation).
 *
 * Réutilise le vocabulaire de `lib/auth/rbac.ts` (`Permission`,
 * `getRolePermissions`) comme BASELINE pour les rôles OTA — aucune
 * nouvelle chaîne de permission n'était nécessaire, le vocabulaire
 * existant ("reservations.*", "clients.*", "staff.*", "accounting.*",
 * "wallet.*", "admin.*") couvre déjà toutes les capacités identifiées
 * dans l'audit de ce projet. Étend seulement la COUVERTURE DE RÔLE à
 * `partner_owner`/`partner_agent` (absents de `AdminShellRole`/
 * `lib/auth/rbac.ts`, qui sont spécifiques à la coquille `/admin`).
 *
 * `permission_grants` (lib/db/schema.ts) ajoute une couche d'override
 * EXPLICITE par utilisateur, au-dessus de ce baseline — jamais un
 * remplacement des rôles : `getEffectivePermission` vérifie d'abord un
 * override explicite (accordé OU révoqué), puis retombe sur le baseline
 * du rôle si aucun override n'existe.
 */

import { and, eq, inArray } from "drizzle-orm"
import type { AdminShellRole } from "@/components/admin-shell"
import type { PartnerRole } from "./partner-profile"
import {
  getRolePermissions as getAdminRolePermissions,
  type Permission,
} from "./rbac"
import { withTenantContext } from "@/lib/db/tenant-context"
import { permissionGrants } from "@/lib/db/schema"
import type { DrizzleTransaction } from "@/lib/db/client"

export type { Permission } from "./rbac"

export type AnyRole = AdminShellRole | PartnerRole

const ADMIN_SHELL_ROLES = new Set<string>([
  "super_admin",
  "manager",
  "agent_resa",
  "agent_compta",
  "agent_excursions",
])

function isAdminShellRole(role: string): role is AdminShellRole {
  return ADMIN_SHELL_ROLES.has(role)
}

/**
 * Baseline PARTENAIRE — volontairement conservateur : ne contient JAMAIS
 * "staff.*" (gérer des utilisateurs) ni "accounting.refunds.process" côté
 * partner_owner — ces capacités restent hors baseline même pour le owner,
 * conformément à la règle explicite "Partner Owner may manage Partner
 * Agents only if explicitly authorized" (délégation requise, jamais
 * automatique par le seul rôle). Un partner_owner qui a besoin de gérer
 * ses agents reçoit un grant `staff.create`/`staff.edit` explicite — voir
 * lib/auth/partner-agent-actions.ts.
 */
const PARTNER_ROLE_PERMISSIONS: Record<"partner_owner" | "partner_agent", readonly Permission[]> = {
  partner_owner: [
    "reservations.view",
    "reservations.create",
    "reservations.edit",
    "reservations.cancel",
    "clients.view",
    "clients.create",
    "clients.edit",
  ],
  partner_agent: ["reservations.view", "reservations.create"],
}

/** Permissions qu'un partner_owner autorisé (grant explicite) peut à son tour déléguer à un partner_agent — jamais "staff.", "admin." ou "accounting.refunds.". */
export const PARTNER_DELEGATABLE_PERMISSIONS: readonly Permission[] = [
  "reservations.view",
  "reservations.create",
  "reservations.edit",
  "clients.view",
  "clients.create",
]

/** Baseline (rôle seul, sans override) — jamais de DB ici, pure et testable. */
export function getBaselinePermissions(role: AnyRole | string | null | undefined): readonly Permission[] {
  if (!role) return []
  if (isAdminShellRole(role)) return getAdminRolePermissions(role)
  if (role === "partner_owner" || role === "partner_agent") return PARTNER_ROLE_PERMISSIONS[role]
  return []
}

export function hasBaselinePermission(
  role: AnyRole | string | null | undefined,
  permission: Permission,
): boolean {
  return getBaselinePermissions(role).includes(permission)
}

export interface EffectivePermissionInput {
  agencyId: string
  userId: string
  role: AnyRole | string | null | undefined
  permission: Permission
  txOverride?: DrizzleTransaction
}

/**
 * Permission effective = override explicite (permission_grants) s'il
 * existe pour CE user précis, sinon baseline du rôle. Toujours résolu
 * côté serveur — jamais un rôle/une permission fournie par le client.
 */
export async function getEffectivePermission(input: EffectivePermissionInput): Promise<boolean> {
  const { agencyId, userId, role, permission, txOverride } = input

  const run = (tx: DrizzleTransaction) =>
    tx
      .select({ granted: permissionGrants.granted })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.agencyId, agencyId),
          eq(permissionGrants.userId, userId),
          eq(permissionGrants.permission, permission),
        ),
      )
      .limit(1)

  const rows = txOverride
    ? await run(txOverride)
    : await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, run)

  if (rows[0]) return rows[0].granted
  return hasBaselinePermission(role, permission)
}

export type PermissionGrantRow = { permission: Permission; granted: boolean }

/**
 * Overrides explicites (permission_grants) pour un groupe d'utilisateurs
 * d'UNE MÊME agence — lecture seule, pour affichage UI (Phase 23). Ne
 * calcule jamais l'effectif seul : le composant doit toujours combiner
 * avec `getBaselinePermissions(role)` pour afficher l'état réel.
 */
export async function getAgencyPermissionGrants(
  agencyId: string,
  userIds: readonly string[],
): Promise<Map<string, PermissionGrantRow[]>> {
  const map = new Map<string, PermissionGrantRow[]>()
  if (userIds.length === 0) return map

  const rows = await withTenantContext({ agencyId, userId: "", isSuperAdmin: false }, (tx) =>
    tx
      .select({
        userId: permissionGrants.userId,
        permission: permissionGrants.permission,
        granted: permissionGrants.granted,
      })
      .from(permissionGrants)
      .where(and(eq(permissionGrants.agencyId, agencyId), inArray(permissionGrants.userId, [...userIds]))),
  )

  for (const row of rows) {
    const list = map.get(row.userId) ?? []
    list.push({ permission: row.permission as Permission, granted: row.granted })
    map.set(row.userId, list)
  }
  return map
}
