/**
 * Statut de configuration MyGo pour le Hub — délègue entièrement à
 * lib/mygo/config.ts (source de vérité inchangée). Ne redéfinit aucune
 * variable d'env, ne duplique aucune logique de credentials.
 */
import { getMyGoConfig } from "@/lib/mygo/config"

export function isMyGoConfigured(): boolean {
  try {
    const cfg = getMyGoConfig()
    return Boolean(cfg.login && cfg.password)
  } catch {
    return false
  }
}
