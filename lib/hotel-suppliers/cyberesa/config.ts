/**
 * Cyberesa — DOCUMENTATION_REQUIRED.
 *
 * Aucune documentation Cyberesa (endpoints, format XML, contrat
 * d'authentification) n'a été trouvée dans ce dépôt/environnement. Rien
 * n'est inventé — voir driver.ts.
 */
export function isCyberesaConfigured(): boolean {
  return Boolean(process.env.CYBERESA_USERNAME && process.env.CYBERESA_PASSWORD)
}
