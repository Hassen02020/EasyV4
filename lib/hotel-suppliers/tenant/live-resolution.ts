/**
 * PHASE 27.1 — Point d'entrée unique pour résoudre l'accès MyGo (client +
 * driver) d'UN tenant donné, pour le trafic LIVE (search/booking/cancel) —
 * jamais un accès direct à `getMyGoClient()` ailleurs dans Search/Booking
 * Core après cette phase (voir call sites : app/api/hotels/search*,
 * app/pro/(app)/hotels/*, lib/booking/*, lib/admin/actions.ts).
 *
 * Règle absolue (mission Phase 27.1, section 2) : les identifiants globaux
 * `MYGO_*` ne sont JAMAIS utilisés pour un tenant qui a un compte fournisseur
 * configuré — `resolveSupplierAccount()` est toujours interrogé en premier,
 * le repli global n'intervient que si aucun compte n'est configuré pour ce
 * tenant (compatibilité ascendante Phase 27 — migration progressive, jamais
 * un retrait silencieux des variables d'environnement existantes).
 */
import { createMyGoClientForAccount, type MyGoClient } from "@/lib/mygo/client"
import { createMyGoDriver, MyGoDriver } from "../mygo/driver"
import { buildMyGoConfigFromAccount } from "../mygo/account-config"
import { resolveSupplierAccount } from "./resolver"
import type { TenantContext } from "@/lib/db/tenant-context"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { logger } from "@/lib/logger"

export interface ResolvedMyGoAccess {
  /**
   * `undefined` = aucun compte fournisseur tenant configuré — repli sur le
   * comportement historique (`getMyGoClient()`/env `MYGO_*`, y compris le
   * mode démo si `MYGO_LOGIN` est absent). NE JAMAIS synthétiser un client
   * ici dans ce cas : `runHotelSearch()`/`executeHotelSearch()` doivent
   * recevoir `undefined`, pas un objet enveloppant `getMyGoClient()`, pour
   * que leur propre détection de mode démo reste inchangée (voir
   * lib/mygo/search-core.ts::isDemoMode()).
   */
  client?: MyGoClient
  driver: MyGoDriver
  accountId: string | null
}

/**
 * Résout le compte fournisseur MyGo du tenant courant (agence propre,
 * compte partagé autorisé, ou aucun => repli global). Ne déchiffre jamais
 * rien elle-même — délègue entièrement à `resolveSupplierAccount()`
 * (lib/hotel-suppliers/tenant/resolver.ts), seul point de déchiffrement
 * légitime de tout le Hub.
 */
export async function resolveMyGoAccessForTenant(tenantContext: TenantContext): Promise<ResolvedMyGoAccess> {
  try {
    const resolved = await resolveSupplierAccount({ supplierCode: "mygo", tenantContext })
    if (resolved.ok) {
      const config = buildMyGoConfigFromAccount(resolved.account)
      const client = createMyGoClientForAccount(resolved.account.accountId, config)
      return { client, driver: new MyGoDriver(client, config), accountId: resolved.account.accountId }
    }
  } catch (err) {
    // Résolution échouée (ex. DB indisponible) — ne jamais bloquer le
    // trafic live pour ça : repli explicite sur le compte global, journalisé.
    logger.warn("[HotelSuppliers] Résolution du compte MyGo tenant échouée — repli sur le compte global", {
      code: err instanceof Error ? err.constructor.name : "unknown",
    })
  }
  return { client: undefined, driver: createMyGoDriver(), accountId: null }
}

/** Contexte tenant pour une requête B2B authentifiée (session partenaire — `requirePartnerSession`/`getCurrentPartnerProfile`). */
export function partnerTenantContext(agencyId: string, userId: string, isSuperAdmin: boolean): TenantContext {
  return { agencyId, userId, isSuperAdmin }
}

/**
 * Contexte tenant pour le trafic B2C anonyme (storefront public, aucune
 * session) — résout l'agence OTA par défaut via le MÊME mécanisme déjà
 * utilisé partout ailleurs pour le guest booking (`getDefaultAgencyId()`,
 * white-label-aware), jamais un ID inventé.
 *
 * `isSuperAdmin: true` reflète EXACTEMENT le choix déjà fait par
 * `getDefaultAgencyId()` lui-même (`withSystemContext`) : aucune session
 * utilisateur à scoper pour un visiteur anonyme, seulement une lecture du
 * compte de LA MÊME agence déjà résolue par `agencyId` — cette élévation ne
 * sert qu'à contourner l'absence de session, jamais à élargir l'accès à une
 * autre agence (le `agencyId` explicite reste la seule portée résolue).
 */
export async function guestTenantContext(): Promise<TenantContext | null> {
  // Import différé : `lib/agencies/default-agency.ts` importe `server-only`
  // (via lib/tenant/current-tenant.ts) — un import statique en tête de
  // fichier casserait le chargement de ce module entier hors runtime
  // Next.js (ex. `node --test`), y compris pour les tests qui n'appellent
  // jamais cette fonction. Import dynamique = coût nul en usage normal
  // (Next.js le résout au premier appel), zéro régression.
  const { getDefaultAgencyId } = await import("@/lib/agencies/default-agency")
  const agencyId = await getDefaultAgencyId()
  if (!agencyId) return null
  return { agencyId, userId: "", isSuperAdmin: true }
}

/**
 * Raccourci pour les Server Components `/pro/(app)/**` qui appellent
 * `runHotelSearch()` directement (hors route handler — pas de
 * `requirePartnerSession`, la session est déjà garantie par le layout
 * parent). Résout la session Supabase courante + le profil partenaire, puis
 * le compte MyGo du tenant. Ne lève jamais — une session absente/invalide
 * retombe sur `{ client: undefined }` (comportement historique inchangé),
 * la page appelante gère déjà la redirection d'auth via son propre layout.
 */
export async function resolvePartnerMyGoAccess(): Promise<ResolvedMyGoAccess> {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { client: undefined, driver: createMyGoDriver(), accountId: null }

    const profile = await getCurrentPartnerProfile(user.id)
    if (!profile) return { client: undefined, driver: createMyGoDriver(), accountId: null }

    const tenantContext = partnerTenantContext(profile.agency.id, profile.userId, profile.role === "super_admin")
    return resolveMyGoAccessForTenant(tenantContext)
  } catch (err) {
    logger.warn("[HotelSuppliers] resolvePartnerMyGoAccess a échoué — repli sur le compte global", {
      code: err instanceof Error ? err.constructor.name : "unknown",
    })
    return { client: undefined, driver: createMyGoDriver(), accountId: null }
  }
}
