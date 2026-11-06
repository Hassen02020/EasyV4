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

/**
 * `version` : surcharge facultative (ex. WHATSAPP_API_VERSION, conservée
 * pour compatibilité — WHATSAPP-CRM-01, W-07). Sans elle, la version Meta
 * commune s'applique.
 */
export function metaGraphUrl(path: string, version?: string): string {
  return `https://graph.facebook.com/${version || metaGraphApiVersion()}/${path.replace(/^\//, "")}`
}
