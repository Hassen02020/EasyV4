/**
 * Liste runtime de toutes les valeurs `Permission` valides — `Permission`
 * (lib/auth/rbac.ts) est un type TS sans existence à l'exécution, et
 * `z.enum()` a besoin d'un tuple de chaînes littérales réelles pour valider
 * l'entrée d'une Server Action. Dérivée de `super_admin`, qui détient par
 * construction toutes les permissions (voir rbac.ts) — pas une deuxième
 * source de vérité.
 */
import { getRolePermissions, type Permission } from "./rbac"

export const RBAC_PERMISSIONS = getRolePermissions("super_admin") as [Permission, ...Permission[]]
