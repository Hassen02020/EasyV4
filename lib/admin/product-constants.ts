/**
 * Constantes produit pures — AUCUNE dépendance serveur (pas de DB, pas de
 * Supabase). Séparé de `product-guard.ts` (qui importe `getCurrentAdminProfile`
 * -> `lib/db/client.ts` -> `postgres`, incompatible navigateur) précisément
 * pour que les formulaires client (`components/admin/*-product-form.tsx`)
 * puissent importer ces valeurs sans entraîner tout le graphe serveur dans
 * le bundle client — bug réel trouvé par `pnpm build` pendant la Phase 13
 * ("Module not found: Can't resolve 'tls'"), pas une prévention théorique.
 */

export const PRODUCT_STATUSES = ["draft", "published", "suspended", "archived"] as const
export type ProductStatus = (typeof PRODUCT_STATUSES)[number]

export function isValidProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as readonly string[]).includes(value)
}

export const PRODUCT_CHANNELS = ["b2c", "b2b", "white_label"] as const
export type ProductChannel = (typeof PRODUCT_CHANNELS)[number]
