/**
 * CRM-EMAIL-ESCAPE-01 (écart G-20, sécurité) — échappement HTML des valeurs
 * saisies par un visiteur (nom, email, téléphone, produit, page, message)
 * avant insertion dans un email interne. Couvre le texte ET les valeurs
 * d'attribut (guillemets simples et doubles).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
