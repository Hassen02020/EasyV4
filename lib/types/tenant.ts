/**
 * Vocabulaire de tenant — types fondamentaux pour l'identité des acteurs,
 * propriétaires et canaux dans Easy2Book V6.
 *
 * Ces types sont la source de vérité TypeScript pour exprimer QUI fait QUOI
 * dans quel canal : réservation directe OTA, revente B2B, white-label, etc.
 * Aucune dépendance DB ni runtime — purement des types exportables côté
 * client et serveur.
 */

/** Qui effectue l'action de réservation. */
export type BookingActorType =
  | "ota_staff" // Employé OTA qui réserve pour un client
  | "b2b_partner" // Agence partenaire B2B réservant pour ses clients
  | "b2c_client" // Client final (portail direct, futur)
  | "super_admin" // Admin plateforme (correction, test)

/** Qui possède/gère le produit vendu. */
export type ProductOwnerType =
  | "ota" // OTA ayant créé le produit dans son catalogue
  | "supplier" // Fournisseur externe (Mygo, Duffel, hotels-monde, etc.)

/**
 * Canal de distribution — dimension qui qualifie la nature de la relation
 * commerciale entre le vendeur et le client final.
 *
 * - 'direct'      : vente directe OTA (portail agence, équipe commerciale)
 * - 'b2b'         : revente via une agence partenaire B2B
 * - 'white_label' : vente sous une marque blanche (domaine propre du tenant)
 * - 'api'         : accès programmatique (futur — distribution via API publique)
 */
export type DistributionChannel = "direct" | "b2b" | "white_label" | "api"

/** Valeurs de canal connues — pour validation et itération. */
export const DISTRIBUTION_CHANNELS: readonly DistributionChannel[] = [
  "direct",
  "b2b",
  "white_label",
  "api",
] as const
