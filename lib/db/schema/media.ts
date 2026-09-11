/**
 * Schéma Drizzle — Media System (produits Omraty / Voyages Organisés /
 * Attractions).
 *
 * `product_media` est la table unique de métadonnées médias. Le fichier
 * binaire n'est JAMAIS stocké en base (voir mission §3) : seule la
 * référence Storage (`storageKey` + `variants`) l'est.
 *
 * Référence polymorphique `module` + `productId` (PAS de FK stricte) :
 * omra_packages / catalog_packages / catalog_activities n'ont aucun parent
 * commun, exactement la même situation que `customerFavorites.itemType` /
 * `itemRef` (lib/db/schema.ts) — même pattern répliqué ici plutôt
 * qu'inventé. `productId` reste uuid (contrairement à itemRef qui doit
 * aussi porter des ids texte myGo) car les 3 modules ciblés sont tous des
 * tables catalogue locales à id uuid ; Hôtels/Vols sont explicitement hors
 * périmètre (mission §1).
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { agencies } from "../schema"

/**
 * Variantes générées par la pipeline d'optimisation (lib/media/optimize.ts).
 * Chaque valeur est une storageKey (ou chemin local en mode fallback) — pas
 * une URL publique figée, pour rester backend-agnostique (Supabase Storage
 * ou filesystem local selon l'environnement, voir lib/media/storage.ts).
 * `original` est toujours présent ; les autres peuvent manquer tant que la
 * pipeline d'optimisation ne les a pas (encore) produites.
 */
export type ProductMediaVariants = {
  original: string
  large?: string
  medium?: string
  card?: string
  thumbnail?: string
}

export const productMedia = pgTable(
  "product_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),

    /** 'omra' | 'package' | 'activity' — voir PRODUCT_MEDIA_MODULES (lib/admin/product-constants.ts). Contrainte CHECK en base (migration 0052). */
    module: varchar("module", { length: 16 }).notNull(),

    /** uuid du produit dans omra_packages / catalog_packages / catalog_activities selon `module`. Pas de FK (voir en-tête de fichier). */
    productId: uuid("product_id").notNull(),

    /** storageKey de l'original — clé complète, ex. `<agencyId>/<module>/<productId>/<uuid>/original.webp`. Jamais le nom de fichier envoyé par l'utilisateur (voir mission §11). */
    storageKey: text("storage_key").notNull(),

    /** Clés des variantes optimisées (large/medium/card/thumbnail), voir ProductMediaVariants. */
    variants: jsonb("variants").$type<ProductMediaVariants>().notNull(),

    /** Nom de fichier original — conservé en métadonnée uniquement, jamais comme storageKey (mission §11). */
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    /** Taille de l'original en octets. */
    fileSize: integer("file_size").notNull(),
    width: integer("width"),
    height: integer("height"),

    altText: varchar("alt_text", { length: 255 }),
    caption: text("caption"),

    /** Ordre d'affichage dans la galerie — l'admin réordonne, le frontend respecte cet ordre (mission §18). */
    sortOrder: integer("sort_order").notNull().default(0),

    /** Une seule image de couverture par produit — appliqué par un index unique partiel (migration 0052), pas seulement en code (mission §17). */
    isCover: boolean("is_cover").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_media_agency_idx").on(t.agencyId),
    /** Galerie d'un produit, dans l'ordre d'affichage — requête la plus fréquente (fetch galerie complète). */
    index("product_media_product_idx").on(t.module, t.productId, t.sortOrder),
    /**
     * Une seule couverture par produit (mission §17 : "une seule couverture").
     * Index unique PARTIEL (where is_cover = true) — même mécanisme que les
     * autres index partiels du fichier (lib/db/schema.ts, ex. ligne 429),
     * pas une invention pour cette table.
     */
    uniqueIndex("product_media_one_cover_uniq")
      .on(t.module, t.productId)
      .where(sql`${t.isCover} = true`),
  ],
)

export type ProductMedia = typeof productMedia.$inferSelect
export type NewProductMedia = typeof productMedia.$inferInsert
