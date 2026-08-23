/**
 * Règles pures de délégation de permission — extraites de
 * `permission-actions.ts` ("use server") pour rester testables sans DB/
 * Supabase Auth, même motif que `lib/admin/users-logic.ts`.
 *
 * Ne résout AUCUNE identité (pas de session, pas de DB) : prend en entrée
 * un "acteur" déjà résolu côté serveur (rôle + agence, jamais fournis par
 * le client) et décide si la délégation demandée est autorisée.
 */

import type { Permission } from "./rbac"

export type DelegationCheckResult = { ok: true } | { ok: false; error: string }

export interface DelegationCheckInput {
  actorUserId: string
  targetUserId: string
  /** true si l'acteur est un super_admin résolu côté serveur (autorité globale). */
  actorIsSuperAdmin: boolean
  /** true si l'acteur détient déjà, lui-même, le grant "staff.edit" (requis pour un partner_owner). */
  actorHasStaffEdit: boolean
  /** Rôle réel de la cible, résolu côté serveur (jamais fourni par le client). */
  targetRole: string | null
  /** true si la cible n'a pas été trouvée dans l'agence de l'acteur (partner_owner) ou globalement (super_admin). */
  targetFound: boolean
  permission: Permission
  delegatablePermissions: readonly Permission[]
}

/**
 * Un super_admin est globalement autorisé (jamais restreint — "super_admin
 * remains globally authorized"). Un partner_owner ne peut déléguer QUE s'il
 * détient lui-même le grant explicite "staff.edit", QUE vers un
 * partner_agent de sa propre agence, QUE parmi les permissions
 * délégables — jamais staff./admin./accounting.refunds.process, jamais un
 * autre owner/manager/super_admin, jamais une autre agence.
 */
export function checkDelegationAllowed(input: DelegationCheckInput): DelegationCheckResult {
  if (input.actorUserId === input.targetUserId) {
    return { ok: false, error: "Vous ne pouvez pas modifier vos propres permissions." }
  }

  if (input.actorIsSuperAdmin) {
    if (!input.targetFound) return { ok: false, error: "Utilisateur cible introuvable." }
    return { ok: true }
  }

  if (!input.actorHasStaffEdit) {
    return {
      ok: false,
      error: "Vous n'êtes pas autorisé à déléguer des permissions — contactez Easy2Book.",
    }
  }
  if (!(input.delegatablePermissions as readonly string[]).includes(input.permission)) {
    return { ok: false, error: "Cette permission ne peut pas être déléguée à un agent." }
  }
  if (!input.targetFound) {
    return { ok: false, error: "Agent introuvable dans votre agence." }
  }
  if (input.targetRole !== "partner_agent") {
    return { ok: false, error: "Vous ne pouvez déléguer des permissions qu'à un partner_agent." }
  }
  return { ok: true }
}
