/**
 * Garde d'autorisation partagée — Master Admin Product Builder (Phase 13).
 *
 * Même modèle que `lib/admin/agencies-actions.ts::assertSuperAdmin` (déjà en
 * production), élargi à `manager` : la gestion du catalogue produit est une
 * tâche métier courante (pas une opération sensible comme suspendre une
 * agence), naturellement du ressort d'un manager Easy2Book, pas seulement du
 * super_admin. `isAllowedIntoAdmin` (lib/auth/admin-gate.ts) a déjà vérifié
 * en amont (proxy.ts + app/admin/layout.tsx) que l'utilisateur est bien un
 * membre du staff Easy2Book (agency_type='ota') — cette fonction ajoute la
 * vérification de rôle spécifique à l'écriture catalogue.
 */

import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

const PRODUCT_MANAGER_ROLES = ["super_admin", "manager"] as const

export interface ProductManagerContext {
  userId: string
  agencyId: string
}

/**
 * Vérifie que l'utilisateur courant est staff Easy2Book (agence OTA) avec un
 * rôle autorisé à gérer le catalogue produit. Renvoie son `userId` et son
 * propre `agencyId` (toujours l'agence OTA elle-même, garanti par
 * `isAllowedIntoAdmin`) — pas besoin de `getDefaultAgencyId()` ici, contrairement
 * aux Server Actions du storefront public : l'admin EST déjà rattaché à
 * l'agence OTA.
 */
export async function assertProductManager(): Promise<ProductManagerContext> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")

  const profile = await getCurrentAdminProfile(user.id)
  if (!profile || !profile.agencyId) throw new Error("FORBIDDEN")
  if (!(PRODUCT_MANAGER_ROLES as readonly string[]).includes(profile.role ?? "")) {
    throw new Error("FORBIDDEN")
  }
  if (profile.agencyType !== "ota") throw new Error("FORBIDDEN")

  return { userId: user.id, agencyId: profile.agencyId }
}
