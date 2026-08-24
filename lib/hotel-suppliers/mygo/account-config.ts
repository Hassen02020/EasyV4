/**
 * PHASE 27 — Traduit un compte fournisseur MyGo résolu par
 * `resolveSupplierAccount()` (identifiants déchiffrés + métadonnées non
 * secrètes du compte) vers un `MyGoConfig` complet, prêt pour
 * `createMyGoClientForAccount()`/`createMyGoDriverForAccount()`.
 *
 * Volontairement le SEUL endroit qui connaît la forme interne de
 * `MyGoConfig` côté Hub multi-tenant — le resolver générique
 * (lib/hotel-suppliers/tenant/resolver.ts) reste provider-neutre et ne
 * manipule que des credentials déchiffrés opaques (Record<string, unknown>).
 *
 * N'appelle JAMAIS `getMyGoConfig()` (sans override) : cette fonction lève en
 * mode live si `MYGO_LOGIN`/`MYGO_PASSWORD` globaux sont absents — faux pour
 * un compte tenant, qui n'a précisément pas besoin de ces variables globales
 * (voir la note de migration MyGo dans le rapport final Phase 27).
 */
import { resolveMyGoInfraDefaults, type MyGoConfig, type MyGoMode } from "@/lib/mygo/config"
import type { ResolvedSupplierAccount } from "../tenant/types"

export interface MyGoAccountCredentials {
  login: string
  password: string
}

export class MyGoAccountCredentialsInvalidError extends Error {
  constructor(accountId: string) {
    super(`Compte MyGo ${accountId}: identifiants déchiffrés invalides (login/password manquants).`)
    this.name = "MyGoAccountCredentialsInvalidError"
  }
}

export function buildMyGoConfigFromAccount(resolved: ResolvedSupplierAccount): MyGoConfig {
  const creds = resolved.credentials as Partial<MyGoAccountCredentials>
  if (!creds.login || !creds.password) {
    throw new MyGoAccountCredentialsInvalidError(resolved.accountId)
  }
  const mode: MyGoMode = resolved.mode === "virtual" ? "virtual" : "live"
  const infra = resolveMyGoInfraDefaults(mode)
  return {
    mode,
    login: creds.login,
    password: creds.password,
    baseUrl: infra.baseUrl,
    // `timeoutMs` du compte (Master Admin/agence) prime sur le défaut infra
    // s'il est explicitement renseigné — jamais l'inverse.
    timeoutMs: resolved.timeoutMs ?? infra.timeoutMs,
    maxRetries: infra.maxRetries,
    staticDataTtlSeconds: infra.staticDataTtlSeconds,
    searchTtlSeconds: infra.searchTtlSeconds,
  }
}
