"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { getDb } from "@/lib/db/client"
import { marketSignals, developmentProjects } from "@/lib/db/schema"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"

async function requireSuperAdmin() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: "Session expirée" }

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") {
    return { ok: false as const, error: "Accès réservé au super_admin." }
  }
  return { ok: true as const, user, profile }
}

export type ActionResult = { ok: true } | { ok: false; error: string }

/* -------------------------------------------------------------------------- */
/* market_signals                                                              */
/* -------------------------------------------------------------------------- */

const createSignalSchema = z.object({
  title: z.string().min(1).max(500),
  sourceUrl: z.string().url(),
  publishedAt: z.string().datetime(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  summary: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
})

export async function createMarketSignal(
  rawData: unknown,
): Promise<ActionResult & { id?: string }> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth

  const parsed = createSignalSchema.safeParse(rawData)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" }

  const db = getDb()
  const [row] = await db
    .insert(marketSignals)
    .values({
      ...parsed.data,
      publishedAt: new Date(parsed.data.publishedAt),
    })
    .returning({ id: marketSignals.id })

  revalidatePath("/admin/veille/signaux")
  revalidatePath("/[locale]", "layout")
  return { ok: true, id: row?.id }
}

export async function deleteMarketSignal(id: string): Promise<ActionResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth

  const db = getDb()
  await db.delete(marketSignals).where(eq(marketSignals.id, id))

  revalidatePath("/admin/veille/signaux")
  revalidatePath("/[locale]", "layout")
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/* development_projects                                                        */
/* -------------------------------------------------------------------------- */

const createProjectSchema = z.object({
  name: z.string().min(1).max(500),
  sourceUrl: z.string().url(),
  publishedAt: z.string().datetime(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  description: z.string().max(4000).optional(),
  location: z.string().max(200).optional(),
  projectType: z.string().max(100).optional(),
  status: z.string().max(100).optional(),
})

const updateProjectSchema = createProjectSchema.partial().extend({
  id: z.string().uuid(),
})

export async function createDevelopmentProject(
  rawData: unknown,
): Promise<ActionResult & { id?: string }> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth

  const parsed = createProjectSchema.safeParse(rawData)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" }

  const db = getDb()
  const [row] = await db
    .insert(developmentProjects)
    .values({
      ...parsed.data,
      publishedAt: new Date(parsed.data.publishedAt),
    })
    .returning({ id: developmentProjects.id })

  revalidatePath("/admin/veille/projets")
  revalidatePath("/[locale]", "layout")
  return { ok: true, id: row?.id }
}

export async function updateDevelopmentProject(
  rawData: unknown,
): Promise<ActionResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth

  const parsed = updateProjectSchema.safeParse(rawData)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" }

  const { id, ...fields } = parsed.data
  const updateValues: Record<string, unknown> = {}
  if (fields.name !== undefined) updateValues.name = fields.name
  if (fields.sourceUrl !== undefined) updateValues.sourceUrl = fields.sourceUrl
  if (fields.publishedAt !== undefined)
    updateValues.publishedAt = new Date(fields.publishedAt)
  if (fields.confidence !== undefined)
    updateValues.confidence = fields.confidence
  if (fields.description !== undefined)
    updateValues.description = fields.description
  if (fields.location !== undefined) updateValues.location = fields.location
  if (fields.projectType !== undefined)
    updateValues.projectType = fields.projectType
  if (fields.status !== undefined) updateValues.status = fields.status

  const db = getDb()
  await db
    .update(developmentProjects)
    .set({ ...updateValues, updatedAt: new Date() })
    .where(eq(developmentProjects.id, id))

  revalidatePath("/admin/veille/projets")
  revalidatePath(`/admin/veille/projets/${id}`)
  revalidatePath("/[locale]", "layout")
  return { ok: true }
}

export async function deleteDevelopmentProject(
  id: string,
): Promise<ActionResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth

  const db = getDb()
  await db.delete(developmentProjects).where(eq(developmentProjects.id, id))

  revalidatePath("/admin/veille/projets")
  revalidatePath("/[locale]", "layout")
  return { ok: true }
}
