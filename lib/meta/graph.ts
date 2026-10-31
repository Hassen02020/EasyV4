/**
 * CRM-META-CONNECT-01 (lot A) — version de l'API Graph Meta, lue à un seul
 * endroit pour tous les appels Meta (Lead Ads, réponses Messenger /
 * Instagram). `META_GRAPH_API_VERSION` facultative ; v21.0 par défaut
 * (valeur déjà utilisée par le code avant ce chantier).
 */
export const DEFAULT_META_GRAPH_API_VERSION = "v21.0"

export function metaGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION || DEFAULT_META_GRAPH_API_VERSION
}

export function metaGraphUrl(path: string): string {
  return `https://graph.facebook.com/${metaGraphApiVersion()}/${path.replace(/^\//, "")}`
}
