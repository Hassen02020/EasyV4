/**
 * CRM-LEAD-FLOW-01 — conservation de la référence de campagne pendant la
 * navigation (côté navigateur uniquement).
 *
 * Avant : le formulaire ne lisait `?campaign=` / `?utm_campaign=` que sur la
 * page où il se trouve. Un visiteur arrivé par une publicité sur l'accueil
 * puis passé sur une fiche produit perdait son attribution.
 *
 * Règle : la campagne de la page courante (paramètre d'URL) prime ; sinon,
 * la PREMIÈRE campagne vue pendant la session (`sessionStorage`, effacée à la
 * fermeture de l'onglet). Aucune donnée personnelle n'est stockée : seule la
 * référence de campagne, déjà présente dans l'URL publique. Donnée analytique,
 * jamais utilisée dans un calcul financier.
 *
 * Le stockage peut être indisponible (navigation privée, blocage) : toute
 * lecture/écriture est protégée et l'absence n'empêche jamais l'envoi du
 * formulaire.
 */

export const CAMPAIGN_STORAGE_KEY = "e2b_campaign_ref"
const MAX_LENGTH = 255

type StorageLike = Pick<Storage, "getItem" | "setItem">

/** `?campaign=` (Easy2Book) prioritaire, sinon `?utm_campaign=` ; vide → null. */
export function extractCampaignRef(
  params: Pick<URLSearchParams, "get"> | null | undefined,
): string | null {
  if (!params) return null
  const raw = params.get("campaign") ?? params.get("utm_campaign")
  const trimmed = raw?.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_LENGTH)
}

/** Mémorise la campagne si aucune n'est encore mémorisée (premier contact). */
export function rememberCampaignRef(
  storage: StorageLike | null | undefined,
  ref: string | null,
): void {
  if (!storage || !ref) return
  try {
    if (!storage.getItem(CAMPAIGN_STORAGE_KEY)) {
      storage.setItem(CAMPAIGN_STORAGE_KEY, ref.slice(0, MAX_LENGTH))
    }
  } catch {
    // stockage indisponible : l'attribution de la page courante reste lue
  }
}

/** Campagne à joindre au prospect : URL courante, sinon premier contact. */
export function resolveCampaignRef(
  params: Pick<URLSearchParams, "get"> | null | undefined,
  storage: StorageLike | null | undefined,
): string | undefined {
  const fromUrl = extractCampaignRef(params)
  if (fromUrl) return fromUrl
  if (!storage) return undefined
  try {
    const stored = storage.getItem(CAMPAIGN_STORAGE_KEY)?.trim()
    return stored ? stored.slice(0, MAX_LENGTH) : undefined
  } catch {
    return undefined
  }
}

/** `sessionStorage` si disponible, sinon null (jamais d'exception). */
export function safeSessionStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null
  } catch {
    return null
  }
}
