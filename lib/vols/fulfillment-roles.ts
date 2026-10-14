/**
 * Rôles autorisés à déclencher le fulfillment vol (émission billet via GDS) —
 * extrait de `fulfillment-action.ts` dans un fichier à part, SANS directive
 * `"use server"`.
 *
 * Next.js impose qu'un fichier `"use server"` n'exporte QUE des fonctions
 * async — une constante exportée directement depuis un tel fichier (comme
 * c'était le cas ici) fait planter l'évaluation du module côté client dès
 * que n'importe quel autre Server Action du même bundle est importé (trouvé
 * via VISUAL-AUDIT-01 : `<VerifyPaymentButton>` plantait silencieusement sur
 * /admin/reservations/[id] à cause de cet export invalide dans un fichier
 * voisin du même bundle — jamais une erreur de logique de paiement).
 */
export const FULFILL_ROLES = ["super_admin", "manager", "agent_resa"] as const
