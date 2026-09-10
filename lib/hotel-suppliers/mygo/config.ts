/**
 * Statut de configuration MyGo pour le Hub — délègue entièrement à
 * lib/mygo/config.ts (source de vérité inchangée). Ne redéfinit aucune
 * variable d'env, ne duplique aucune logique de credentials.
 */
import { getMyGoConfig, type MyGoConfig } from "@/lib/mygo/config"

/**
 * `override` — PHASE 27 : statut d'un compte fournisseur tenant (identifiants
 * résolus par `resolveSupplierAccount()`), jamais lu depuis l'environnement
 * process quand fourni. Omis => comportement inchangé (compte global `MYGO_*`).
 */
export function isMyGoConfigured(override?: MyGoConfig): boolean {
  try {
    const cfg = getMyGoConfig(override)
    return Boolean(cfg.login && cfg.password)
  } catch {
    return false
  }
}
