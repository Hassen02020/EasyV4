"use server"

import { revalidatePath } from "next/cache"
import { eq, asc } from "drizzle-orm"
import { z } from "zod"
import { getDb } from "@/lib/db/client"
import { destinations, type Destination } from "@/lib/db/schema"
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

const setFeaturedSchema = z.object({
  id: z.string().uuid(),
  isFeatured: z.boolean(),
  displayOrder: z.number().int().min(0).max(9999),
})

export async function setFeaturedDestination(
  rawData: unknown,
): Promise<ActionResult> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth

  const parsed = setFeaturedSchema.safeParse(rawData)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" }

  const { id, isFeatured, displayOrder } = parsed.data
  const db = getDb()
  await db
    .update(destinations)
    .set({ isFeatured, displayOrder, updatedAt: new Date() })
    .where(eq(destinations.id, id))

  revalidatePath("/admin/veille/destinations")
  revalidatePath("/[locale]", "layout")
  return { ok: true }
}

export async function listDestinationsForAdmin(): Promise<Destination[]> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return []

  const db = getDb()
  return db
    .select()
    .from(destinations)
    .where(eq(destinations.isActive, true))
    .orderBy(asc(destinations.name))
}
