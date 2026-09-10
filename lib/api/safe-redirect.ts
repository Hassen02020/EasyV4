/**
 * Valide un chemin de redirection fourni par le client (`?next=`,
 * `?redirectTo=`) avant de l'utiliser dans un `NextResponse.redirect` —
 * évite un open redirect (`next=//evil.com`, `\evil.com`, ou une URL
 * absolue) qui exploiterait un lien magique/callback OAuth pour rediriger
 * un utilisateur fraîchement authentifié vers un domaine tiers.
 *
 * Un simple `startsWith("/")` ne suffit pas : `new URL("//evil.com", origin)`
 * résout vers l'origine `evil.com` (URL protocole-relative), et pour un
 * schéma spécial (http/https) le parseur WHATWG traite aussi `\` comme `/`
 * en tête de chemin. On réutilise donc la même résolution `new URL` que
 * celle utilisée pour la redirection finale, et on compare l'origine
 * résolue à l'origine de l'app — seule vérification robuste.
 */
export function safeInternalRedirect(
  raw: string | null,
  origin: string,
  fallback: string,
): string {
  if (!raw) return fallback
  try {
    const resolved = new URL(raw, origin)
    return resolved.origin === origin ? raw : fallback
  } catch {
    return fallback
  }
}
