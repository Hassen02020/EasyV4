import { desc } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { developmentProjects, type DevelopmentProject } from "@/lib/db/schema"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type * as schema from "@/lib/db/schema"

export const DEVELOPMENT_PROJECTS_PAGE_SIZE = 4

export async function getLatestDevelopmentProjects(
  limit = DEVELOPMENT_PROJECTS_PAGE_SIZE,
  db: PostgresJsDatabase<typeof schema> = getDb(),
): Promise<DevelopmentProject[]> {
  return db
    .select()
    .from(developmentProjects)
    .orderBy(desc(developmentProjects.publishedAt))
    .limit(limit)
}
