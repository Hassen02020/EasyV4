/**
 * Schéma Marché — Easy2Book V6
 *
 * Garde-fous anti-fabrication (R9-01) :
 *  - source_url NOT NULL : chaque signal doit citer sa source primaire.
 *  - published_at NOT NULL : horodatage de publication de la source (pas d'insertion).
 *  - confidence NOT NULL : niveau de confiance déclaré par l'opérateur.
 *
 * Ces colonnes sont intentionnellement NOT NULL pour interdire l'insertion
 * de données de marché sans traçabilité de source.
 */

import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export const marketSignalConfidence = pgEnum("market_signal_confidence", [
  "LOW",
  "MEDIUM",
  "HIGH",
])

export const developmentProjectConfidence = pgEnum(
  "development_project_confidence",
  ["LOW", "MEDIUM", "HIGH"],
)

/* -------------------------------------------------------------------------- */
/* market_signals                                                              */
/* -------------------------------------------------------------------------- */

export const marketSignals = pgTable(
  "market_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Garde-fous anti-fabrication (NOT NULL obligatoires)
    sourceUrl: text("source_url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    confidence: marketSignalConfidence("confidence").notNull(),

    // Contenu du signal
    title: text("title").notNull(),
    summary: text("summary"),
    category: text("category"),
    region: text("region"),

    // Métadonnées
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("market_signals_published_at_idx").on(t.publishedAt),
    index("market_signals_confidence_idx").on(t.confidence),
    index("market_signals_region_idx").on(t.region),
  ],
)

export type MarketSignal = typeof marketSignals.$inferSelect
export type NewMarketSignal = typeof marketSignals.$inferInsert

/* -------------------------------------------------------------------------- */
/* development_projects                                                        */
/* -------------------------------------------------------------------------- */

export const developmentProjects = pgTable(
  "development_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Garde-fous anti-fabrication (NOT NULL obligatoires)
    sourceUrl: text("source_url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    confidence: developmentProjectConfidence("confidence").notNull(),

    // Contenu du projet
    name: text("name").notNull(),
    description: text("description"),
    location: text("location"),
    projectType: text("project_type"),
    status: text("status"),

    // Métadonnées
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("development_projects_published_at_idx").on(t.publishedAt),
    index("development_projects_confidence_idx").on(t.confidence),
    index("development_projects_location_idx").on(t.location),
  ],
)

export type DevelopmentProject = typeof developmentProjects.$inferSelect
export type NewDevelopmentProject = typeof developmentProjects.$inferInsert

/* -------------------------------------------------------------------------- */
/* development_project_waitlist                                                */
/* -------------------------------------------------------------------------- */

export const developmentProjectWaitlist = pgTable(
  "development_project_waitlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => developmentProjects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    locale: text("locale").notNull().default("fr"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("development_project_waitlist_project_email_uidx").on(
      t.projectId,
      t.email,
    ),
    index("development_project_waitlist_project_id_idx").on(t.projectId),
  ],
)

export type DevelopmentProjectWaitlistEntry =
  typeof developmentProjectWaitlist.$inferSelect
export type NewDevelopmentProjectWaitlistEntry =
  typeof developmentProjectWaitlist.$inferInsert
