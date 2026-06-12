/**
 * Server Actions pour la gestion des configurations de modules
 *
 * Ces actions permettent au Super Admin de gérer les Feature Flags
 * et les configurations des modules de réservation (activation/désactivation,
 * configuration des marges, sélection du fournisseur).
 */

"use server"

import { getDb } from "@/lib/db/client"
import { moduleConfigs } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

/**
 * Interface pour la mise à jour d'un module
 */
export interface UpdateModuleConfigInput {
  moduleType: string
  isActive?: boolean
  providerName?: string
  marginPercentage?: number
  notes?: string
}

/**
 * Récupère toutes les configurations de modules
 */
export async function getModuleConfigs() {
  try {
    const db = getDb()
    const configs = await db.select().from(moduleConfigs).orderBy(moduleConfigs.moduleType)
    return { success: true, data: configs }
  } catch (error) {
    console.error("Erreur lors de la récupération des configurations:", error)
    return { success: false, error: "Impossible de récupérer les configurations" }
  }
}

/**
 * Met à jour la configuration d'un module
 */
export async function updateModuleConfig(input: UpdateModuleConfigInput) {
  try {
    const db = getDb()

    // Vérifier si la configuration existe
    const [existing] = await db
      .select()
      .from(moduleConfigs)
      .where(eq(moduleConfigs.moduleType, input.moduleType as any))
      .limit(1)

    if (existing) {
      // Mise à jour
      await db
        .update(moduleConfigs)
        .set({
          ...(input.isActive !== undefined && { isActive: input.isActive }),
          ...(input.providerName !== undefined && { providerName: input.providerName }),
          ...(input.marginPercentage !== undefined && {
            marginPercentage: input.marginPercentage.toString(),
          }),
          ...(input.notes !== undefined && { notes: input.notes }),
          updatedAt: new Date(),
        })
        .where(eq(moduleConfigs.moduleType, input.moduleType as any))
    } else {
      // Création
      await db.insert(moduleConfigs).values({
        moduleType: input.moduleType as any,
        isActive: input.isActive ?? true,
        providerName: input.providerName,
        marginPercentage: input.marginPercentage?.toString() ?? "0.00",
        notes: input.notes,
      })
    }

    // Revalider la page pour rafraîchir les données
    revalidatePath("/admin/configurations")

    return { success: true }
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la configuration:", error)
    return { success: false, error: "Impossible de mettre à jour la configuration" }
  }
}

/**
 * Active ou désactive un module (Feature Flag)
 */
export async function toggleModuleActive(moduleType: string, isActive: boolean) {
  return updateModuleConfig({ moduleType, isActive })
}

/**
 * Met à jour la marge d'un module
 */
export async function updateModuleMargin(moduleType: string, marginPercentage: number) {
  return updateModuleConfig({ moduleType, marginPercentage })
}
