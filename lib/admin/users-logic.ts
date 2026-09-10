/**
 * Règles pures de gestion du personnel — extraites de
 * `users-actions.ts` ("use server") pour rester testables sans DB/Supabase
 * Auth. Même motif que `lib/finance/manual-payment-logic.ts`.
 */

export interface RoleChangeCheckInput {
  actorRole: string
  actorUserId: string
  targetUserId: string
  targetCurrentRole?: string
  nextRole: string
}

export type RoleChangeCheckResult = { ok: true } | { ok: false; error: string }

/**
 * Un manager ne peut jamais s'auto-modifier (statut ou rôle) — évite un
 * verrouillage accidentel si c'est le seul manager de l'agence. Ni créer,
 * ni promouvoir, ni modifier un compte super_admin — seul un super_admin
 * gère les comptes super_admin (lui-même inclus).
 */
export function checkRoleChangeAllowed(input: RoleChangeCheckInput): RoleChangeCheckResult {
  if (input.actorUserId === input.targetUserId) {
    return { ok: false, error: "Vous ne pouvez pas modifier votre propre compte." }
  }
  if (input.nextRole === "super_admin" && input.actorRole !== "super_admin") {
    return { ok: false, error: "Seul un super_admin peut accorder le rôle super_admin." }
  }
  if (input.targetCurrentRole === "super_admin" && input.actorRole !== "super_admin") {
    return { ok: false, error: "Seul un super_admin peut modifier un compte super_admin." }
  }
  return { ok: true }
}

export interface SelfActionCheckInput {
  actorUserId: string
  targetUserId: string
}

export function checkNotSelfTarget(input: SelfActionCheckInput): RoleChangeCheckResult {
  if (input.actorUserId === input.targetUserId) {
    return { ok: false, error: "Vous ne pouvez pas modifier votre propre compte." }
  }
  return { ok: true }
}
