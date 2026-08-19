/**
 * Frontière d'autorisation pour le back-office plateforme (`/admin`).
 *
 * Extrait en fonction pure testable après un bug trouvé pendant le stress
 * test B2B/B2C : `manager`/`agent_resa`/`agent_compta`/`agent_excursions`
 * sont des rôles PARTAGÉS entre le staff Easy2Book et le personnel d'une
 * agence partenaire B2B (cf. lib/api/auth-guard.ts::requirePartnerSession,
 * qui autorise ces mêmes rôles pour une session "partenaire"). Vérifier
 * uniquement le rôle laissait donc un manager d'agence partenaire franchir
 * la porte vers le back-office plateforme. Seul `agency_type = 'ota'`
 * distingue vraiment le staff Easy2Book d'une agence partenaire — les deux
 * conditions (rôle ET agence OTA) sont nécessaires.
 *
 * Utilisée à la fois par `proxy.ts` (middleware) et `app/admin/layout.tsx`
 * (defense-in-depth) pour éviter que les deux couches divergent avec le
 * temps.
 */

export const ADMIN_ROLES = [
  "super_admin",
  "manager",
  "agent_resa",
  "agent_compta",
  "agent_excursions",
] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]

export function isAdminRole(role: string | null | undefined): role is AdminRole {
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role)
}

/**
 * Autorise l'entrée dans `/admin` uniquement si le rôle est un rôle staff
 * ET que l'agence de l'utilisateur est bien l'OTA Easy2Book elle-même —
 * jamais une agence partenaire, quel que soit son rôle.
 */
export function isAllowedIntoAdmin(
  role: string | null | undefined,
  agencyType: string | null | undefined,
): boolean {
  return isAdminRole(role) && agencyType === "ota"
}
