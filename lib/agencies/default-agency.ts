/**
 * Résolution de l'agence par défaut pour les pages de vente publiques B2C.
 *
 * Les pages storefront (/transferts/resultats, etc.) n'ont pas de session
 * partenaire pour déterminer l'agence courante — le tarif et la marge
 * appliqués doivent pourtant être scopés à une agence réelle (jamais un ID
 * inventé). On résout l'agence "OTA directe" (agency_type = 'ota',
 * cf. lib/db/schema.ts) qui représente Easy2Book lui-même.
 */

import { withSystemContext } from "@/lib/db/tenant-context"
import { agencies } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * Retourne l'ID de l'agence OTA directe, ou `null` si aucune agence de ce
 * type n'est configurée — l'appelant doit afficher une erreur claire plutôt
 * que de fabriquer un contexte de tarification.
 *
 * Trafic anonyme (pages storefront publiques) : pas de session à résoudre.
 * `withSystemContext` est sûr ici car le filtre (`agency_type = 'ota'`) est
 * fixé côté serveur, jamais influencé par une entrée utilisateur.
 */
export async function getDefaultAgencyId(): Promise<string | null> {
  try {
    const [agency] = await withSystemContext((db) =>
      db
        .select({ id: agencies.id })
        .from(agencies)
        .where(eq(agencies.agencyType, "ota"))
        .limit(1),
    )
    return agency?.id ?? null
  } catch {
    return null
  }
}
