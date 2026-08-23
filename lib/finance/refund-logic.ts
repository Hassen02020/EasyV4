/**
 * Rôles autorisés à effectuer un remboursement — extrait de
 * `refund-actions.ts` (fichier "use server", qui ne peut exporter QUE des
 * fonctions async — voir la convention Next.js) pour rester importable
 * depuis un composant UI (gate d'affichage du bouton Rembourser) sans
 * déclencher d'erreur de build. Même motif que
 * `lib/finance/manual-payment-logic.ts::MANUAL_PAYMENT_ALLOWED_ROLES`.
 */
export const REFUND_ALLOWED_ROLES = ["super_admin", "manager", "agent_compta"] as const
