/**
 * Schéma Drizzle — Canonical Destination Model (Phase Premium 2, chantier 2)
 *
 * Contexte (voir docs/audits/destination-model-audit.md, chantier 1) : aucune
 * table géographique partagée n'existait avant ce chantier — chaque module
 * (Hôtels Tunisie via myGo, Hôtels Monde, Packages, Vols) a sa propre liste de
 * destinations, avec 4 systèmes d'identifiants non réconciliés (cityId myGo,
 * slug Hôtels Monde, slug Packages, code IATA).
 *
 * Tables :
 *   - destinations             : hiérarchie réelle Pays → Ville (2 niveaux,
 *                                calquée sur la vraie structure fournisseur
 *                                myGo — Country{Id,Name} → City{Id,Name,Region}
 *                                — pas une hiérarchie à 3+ niveaux inventée).
 *   - destination_external_refs : table de correspondance vers les ID déjà
 *                                utilisés par chaque module — chaque module
 *                                continue de parler son propre langage
 *                                (myGo cityId, slug Hôtels Monde/Packages,
 *                                code IATA), cette table fait juste le pont
 *                                vers l'ID canonique. Aucun module n'est
 *                                rebranché dessus dans ce chantier (chantier 3).
 *
 * Décisions d'architecture :
 *   1. `region` reste un champ texte libre sur les villes (ex. "Cap Bon"),
 *      pas un niveau de hiérarchie séparé — myGo lui-même ne le modélise que
 *      comme un attribut de la ville, jamais comme un niveau navigable, et
 *      aucun besoin produit actuel (taxonomie mission : Tunisie > Hammamet/
 *      Sousse/... > Hôtels/Attractions/...) ne demande un niveau région.
 *   2. Table plateforme (pas de agency_id) — c'est un référentiel géo partagé
 *      par toute la plateforme, pas une donnée par agence. Même raisonnement
 *      que `hotel_suppliers` (drizzle/manual/0035_hotel_supplier_control_plane.sql) :
 *      RLS = lecture pour toute session réelle authentifiée, écriture réservée
 *      au Master Admin. Les pages publiques anonymes (recherche/autocomplete)
 *      lisent via `withSystemContext()`, comme le fait déjà tout le catalogue
 *      public (catalog_packages, catalog_activities).
 *   3. `destination_external_refs.module` est un varchar + CHECK (pas un enum
 *      Postgres) — cette liste de sources va grandir (transferts, nouveaux
 *      fournisseurs) et un varchar+CHECK s'étend par une migration simple,
 *      contrairement à un enum natif. Même choix que `reviews.module`.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  decimal,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const destinationType = pgEnum("destination_type", ["country", "city"])

/* -------------------------------------------------------------------------- */
/* Destinations (référentiel géo canonique — Pays → Ville)                    */
/* -------------------------------------------------------------------------- */

export const destinations = pgTable(
  "destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: destinationType("type").notNull(),
    /** Null pour un pays ; obligatoire pour une ville (voir check ci-dessous). */
    parentId: uuid("parent_id").references((): AnyPgColumn => destinations.id, {
      onDelete: "restrict",
    }),
    /** URL-friendly, unique — sert aux futures pages /destinations/[slug] (chantier 4). */
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    nameEn: varchar("name_en", { length: 120 }),
    nameAr: varchar("name_ar", { length: 120 }),
    /** ISO 3166-1 alpha-2, renseigné uniquement sur les lignes type='country'. */
    countryCode: varchar("country_code", { length: 2 }),
    /** Texte libre côté ville (ex. "Cap Bon") — métadonnée, pas un niveau de hiérarchie. */
    region: varchar("region", { length: 100 }),
    latitude: decimal("latitude", { precision: 9, scale: 6 }),
    longitude: decimal("longitude", { precision: 9, scale: 6 }),
    coverMediaUrl: text("cover_media_url"),
    seoDescription: text("seo_description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("destinations_slug_uniq").on(t.slug),
    index("destinations_parent_idx").on(t.parentId),
    index("destinations_type_active_idx").on(t.type, t.isActive),
    uniqueIndex("destinations_country_code_uniq")
      .on(t.countryCode)
      .where(sql`${t.type} = 'country'`),
    check(
      "destinations_city_has_parent_check",
      sql`(${t.type} = 'country' and ${t.parentId} is null) or (${t.type} = 'city' and ${t.parentId} is not null)`,
    ),
  ],
)

/* -------------------------------------------------------------------------- */
/* Destination External Refs (correspondance vers les ID déjà utilisés)       */
/* -------------------------------------------------------------------------- */

export const destinationExternalRefs = pgTable(
  "destination_external_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    destinationId: uuid("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    /** 'mygo_city' | 'hotels_monde_slug' | 'packages_slug' | 'iata' */
    module: varchar("module", { length: 32 }).notNull(),
    externalId: varchar("external_id", { length: 64 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("destination_external_refs_module_external_uniq").on(t.module, t.externalId),
    index("destination_external_refs_destination_idx").on(t.destinationId),
    index("destination_external_refs_module_idx").on(t.module, t.isActive),
  ],
)

export type Destination = typeof destinations.$inferSelect
export type NewDestination = typeof destinations.$inferInsert
export type DestinationExternalRef = typeof destinationExternalRefs.$inferSelect
export type NewDestinationExternalRef = typeof destinationExternalRefs.$inferInsert
