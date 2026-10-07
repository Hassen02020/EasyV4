import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

/**
 * Public visual/content configuration.
 *
 * These tables are editorial configuration, not booking/financial data.
 * The public storefront reads them server-side; admin writes are tenant-scoped.
 */

export const publicSiteSettings = pgTable(
  "public_site_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),
    heroImageUrl: text("hero_image_url"),
    facebookUrl: text("facebook_url"),
    instagramUrl: text("instagram_url"),
    tiktokUrl: text("tiktok_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("public_site_settings_agency_uniq").on(t.agencyId)],
)

export const publicModuleVisuals = pgTable(
  "public_module_visuals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),
    moduleSlug: varchar("module_slug", { length: 64 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    heroImageUrl: text("hero_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("public_module_visuals_agency_module_uniq").on(
      t.agencyId,
      t.moduleSlug,
    ),
    index("public_module_visuals_agency_enabled_idx").on(
      t.agencyId,
      t.enabled,
      t.sortOrder,
    ),
  ],
)

export const publicPromotions = pgTable(
  "public_promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    subtitle: varchar("subtitle", { length: 300 }),
    destination: varchar("destination", { length: 120 }).notNull(),
    moduleSlug: varchar("module_slug", { length: 64 }).notNull(),
    href: text("href").notNull(),
    imageUrl: text("image_url").notNull(),
    flag: varchar("flag", { length: 16 }),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("public_promotions_agency_active_idx").on(
      t.agencyId,
      t.enabled,
      t.sortOrder,
    ),
  ],
)

export type PublicSiteSettings = typeof publicSiteSettings.$inferSelect
export type NewPublicSiteSettings = typeof publicSiteSettings.$inferInsert
export type PublicModuleVisual = typeof publicModuleVisuals.$inferSelect
export type NewPublicModuleVisual = typeof publicModuleVisuals.$inferInsert
export type PublicPromotion = typeof publicPromotions.$inferSelect
export type NewPublicPromotion = typeof publicPromotions.$inferInsert
