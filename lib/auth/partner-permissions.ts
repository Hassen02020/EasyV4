/**
 * Droits différenciés au sein d'une même agence partenaire B2B
 * (`partner_owner` vs `partner_agent`) — voir EASYV4_DEEP_AUDIT_REPORT.md,
 * modèle B2C < Partner Agent < Partner Owner < Admin OTA.
 *
 * `partner_agent` et `partner_owner` partagent le même scope RLS (agence),
 * mais certaines actions au sein de l'agence restent réservées au owner.
 * Extrait en fonction pure testable — même pattern que
 * `lib/auth/admin-gate.ts::isAllowedIntoAdmin` — pour que la même règle
 * serve à la fois le guard serveur (page) et le filtrage de navigation (UI),
 * sans jamais diverger entre les deux.
 */

import type { PartnerRole } from "./partner-profile"

/**
 * Gestion des collaborateurs de l'agence (inviter/activer/désactiver/
 * supprimer un `partner_agent`) — droit owner. `super_admin` conservé pour
 * le mode "vue B2B simulée" (cohérent avec le reste de /pro).
 */
export function canManagePartnerUsers(
  role: PartnerRole | string | null | undefined,
): boolean {
  return role === "partner_owner" || role === "super_admin"
}
