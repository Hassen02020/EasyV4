/**
 * RBAC - Role-Based Access Control
 * Système de contrôle d'accès granulaire pour Easy2Book
 * 
 * Architecture:
 * - Permissions atomiques (canViewReservations, canEditPrices, etc.)
 * - Rôles composés de permissions
 * - Middleware et Layouts utilisent ces fonctions pour protéger les routes
 */

import type { AdminShellRole } from "@/components/admin-shell"

// ============================================================================
// PERMISSIONS ATOMIQUES
// ============================================================================

export type Permission =
  // B2C Reservations
  | "reservations.view"
  | "reservations.create"
  | "reservations.edit"
  | "reservations.delete"
  | "reservations.confirm"
  | "reservations.cancel"
  | "reservations.refund"
  
  // Clients
  | "clients.view"
  | "clients.create"
  | "clients.edit"
  | "clients.delete"
  
  // Produits (Catalogue)
  | "products.view"
  | "products.create"
  | "products.edit"
  | "products.delete"
  | "products.publish"
  | "products.pricing.edit"
  
  // Comptabilité
  | "accounting.view"
  | "accounting.payments.process"
  | "accounting.invoices.create"
  | "accounting.reports.view"
  | "accounting.refunds.process"
  
  // Personnel (Manager+)
  | "staff.view"
  | "staff.create"
  | "staff.edit"
  | "staff.delete"
  | "staff.roles.assign"
  
  // Administration Système (Super Admin)
  | "admin.users.view"
  | "admin.users.create"
  | "admin.users.delete"
  | "admin.agencies.view"
  | "admin.agencies.create"
  | "admin.system.logs"
  | "admin.system.config"

// ============================================================================
// MATRICE DE PERMISSIONS PAR RÔLE
// ============================================================================

const ROLE_PERMISSIONS: Record<AdminShellRole, Permission[]> = {
  super_admin: [
    // Toutes les permissions
    "reservations.view", "reservations.create", "reservations.edit", "reservations.delete",
    "reservations.confirm", "reservations.cancel", "reservations.refund",
    "clients.view", "clients.create", "clients.edit", "clients.delete",
    "products.view", "products.create", "products.edit", "products.delete", "products.publish", "products.pricing.edit",
    "accounting.view", "accounting.payments.process", "accounting.invoices.create",
    "accounting.reports.view", "accounting.refunds.process",
    "staff.view", "staff.create", "staff.edit", "staff.delete", "staff.roles.assign",
    "admin.users.view", "admin.users.create", "admin.users.delete",
    "admin.agencies.view", "admin.agencies.create",
    "admin.system.logs", "admin.system.config",
  ],
  
  manager: [
    // Tout sauf administration système
    "reservations.view", "reservations.create", "reservations.edit",
    "reservations.confirm", "reservations.cancel", "reservations.refund",
    "clients.view", "clients.create", "clients.edit",
    "products.view", "products.create", "products.edit", "products.publish", "products.pricing.edit",
    "accounting.view", "accounting.payments.process", "accounting.invoices.create",
    "accounting.reports.view", "accounting.refunds.process",
    "staff.view", "staff.create", "staff.edit", "staff.roles.assign",
  ],
  
  agent_resa: [
    // Réservations et produits (lecture)
    "reservations.view", "reservations.create", "reservations.edit",
    "reservations.confirm", "reservations.cancel",
    "clients.view", "clients.create", "clients.edit",
    "products.view",
  ],
  
  agent_compta: [
    // Comptabilité et réservations (lecture)
    "reservations.view",
    "clients.view",
    "accounting.view", "accounting.payments.process", "accounting.invoices.create",
    "accounting.reports.view", "accounting.refunds.process",
  ],
  
  agent_excursions: [
    // Spécialiste excursions
    "reservations.view", "reservations.create", "reservations.edit",
    "reservations.confirm", "reservations.cancel",
    "clients.view", "clients.create",
    "products.view", "products.edit", // Peut modifier les excursions
  ],
}

// ============================================================================
// FONCTIONS DE VÉRIFICATION
// ============================================================================

/**
 * Vérifie si un rôle a une permission spécifique
 */
export function hasPermission(role: AdminShellRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

/**
 * Vérifie si un rôle a AU MOINS UNE des permissions demandées
 */
export function hasAnyPermission(role: AdminShellRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

/**
 * Vérifie si un rôle a TOUTES les permissions demandées
 */
export function hasAllPermissions(role: AdminShellRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p))
}

// ============================================================================
// HELPERS POUR LAYOUTS
// ============================================================================

/**
 * Récupère toutes les permissions d'un rôle
 */
export function getRolePermissions(role: AdminShellRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? []
}

/**
 * Vérifie l'accès à une section entière
 */
export function canAccessSection(
  role: AdminShellRole,
  section: "b2c" | "products" | "accounting" | "staff" | "admin"
): boolean {
  const sectionPermissions: Record<string, Permission[]> = {
    b2c: ["reservations.view", "clients.view"],
    products: ["products.view"],
    accounting: ["accounting.view"],
    staff: ["staff.view"],
    admin: ["admin.users.view"],
  }
  
  return hasAnyPermission(role, sectionPermissions[section] ?? [])
}

// ============================================================================
// MESSAGES D'ERREUR
// ============================================================================

export const FORBIDDEN_MESSAGES: Record<string, string> = {
  "reservations.view": "Vous n'avez pas accès aux réservations.",
  "reservations.edit": "Vous ne pouvez pas modifier les réservations.",
  "reservations.confirm": "Seuls les managers peuvent confirmer les réservations.",
  "reservations.refund": "Seuls les agents compta peuvent traiter les remboursements.",
  "accounting.view": "Accès comptabilité réservé aux agents compta et managers.",
  "staff.view": "Gestion du personnel réservée aux managers.",
  "admin.users.view": "Administration système réservée au Super Admin.",
  default: "Accès refusé. Vous n'avez pas les permissions nécessaires.",
}

export function getForbiddenMessage(permission?: Permission): string {
  return permission ? (FORBIDDEN_MESSAGES[permission] ?? FORBIDDEN_MESSAGES.default) : FORBIDDEN_MESSAGES.default
}
