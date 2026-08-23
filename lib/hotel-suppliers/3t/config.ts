/**
 * 3T — DOCUMENTATION_REQUIRED.
 *
 * Une documentation Postman a été fournie
 * (https://documenter.getpostman.com/view/5722171/2sB34hHLYX) mais
 * l'accès réseau sortant vers documenter.getpostman.com est bloqué par la
 * politique d'égress de cet environnement (EGRESS_BLOCKED, vérifié en
 * direct). La documentation n'a donc pas pu être lue depuis cette session
 * — rien n'est inventé (aucun endpoint/champ deviné). À reprendre dès
 * qu'un environnement avec accès à ce domaine (ou une copie locale de la
 * doc) est disponible.
 */
export function isThreeTConfigured(): boolean {
  return Boolean(process.env.THREET_USERNAME && process.env.THREET_PASSWORD)
}
