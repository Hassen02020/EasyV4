"use server"

import { z } from "zod"
import { getDb } from "@/lib/db/client"
import { developmentProjectWaitlist } from "@/lib/db/schema"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type * as schema from "@/lib/db/schema"

export type WaitlistResult = { ok: true } | { ok: false; error: string }

const waitlistSchema = z.object({
  projectId: z.string().uuid(),
  email: z.string().email().max(320),
  locale: z.string().min(2).max(10),
})

export async function _insertWaitlistEntry(
  data: z.infer<typeof waitlistSchema>,
  db: PostgresJsDatabase<typeof schema> = getDb(),
): Promise<WaitlistResult> {
  await db
    .insert(developmentProjectWaitlist)
    .values({
      projectId: data.projectId,
      email: data.email.toLowerCase().trim(),
      locale: data.locale,
    })
    .onConflictDoNothing()
  return { ok: true }
}

export async function submitWaitlistEntry(
  rawData: unknown,
): Promise<WaitlistResult> {
  const parsed = waitlistSchema.safeParse(rawData)
  if (!parsed.success) return { ok: false, error: "invalid_input" }
  try {
    return await _insertWaitlistEntry(parsed.data)
  } catch {
    return { ok: false, error: "server_error" }
  }
}
