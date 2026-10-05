/**
 * CANONICAL-HOTEL-01 (2026-10-05) — persiste le résultat déjà calculé par
 * `deduplicateHotels()`/`matchHotels()` (mapping.ts, deduplication.ts,
 * inchangés par ce chantier) dans une identité Easy2Book stable, partagée
 * entre fournisseurs (canonical_hotels/canonical_hotel_supplier_mappings,
 * schema/canonical-hotels.ts). Voir l'audit CANONICAL du 2026-10-01
 * (docs/ROADMAP.md) : le calcul de correspondance existait déjà et était
 * correct, seule la persistance manquait — ce module ferme UNIQUEMENT ce
 * trou, sans toucher à la logique de matching elle-même.
 *
 * Seuil volontairement plus strict que l'affichage : `deduplicateHotels()`/
 * `isAutoMergeable()` tolèrent EXACT/HIGH/MEDIUM pour le regroupement
 * visuel d'UNE SEULE recherche (coût d'un faux positif : un doublon visuel
 * éphémère, sans conséquence). Ici, SEULE la confiance EXACT crée ou étend
 * une identité canonical persistée — un faux positif persisté fusionnerait
 * durablement deux établissements différents. HIGH/MEDIUM/LOW ne sont donc
 * PAS persistés dans cette v1 : aucune file de revue humaine n'existe
 * encore (hors scope de ce chantier, à proposer séparément si le besoin se
 * confirme une fois un second fournisseur réel connecté).
 *
 * Best-effort strict : jamais une erreur de persistance ne doit faire
 * échouer ou ralentir une recherche hôtel réelle — toute exception est
 * loggée et absorbée ici, jamais propagée à l'appelant (voir le seul
 * caller : lib/hotel-suppliers/search-hub.ts::runSearchThroughHub()). La
 * réponse HTTP client ne dépend de toute façon pas de ce chemin (voir
 * l'en-tête de search-hub.ts : `hubResult` est de l'observabilité, pas la
 * source de la réponse tant qu'un seul fournisseur réel existe).
 */
import { and, eq } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import {
  canonicalHotels,
  canonicalHotelSupplierMappings,
} from "@/lib/db/schema"
import { logger } from "@/lib/logger"
import type { DeduplicatedHotelGroup } from "./types"

async function findCanonicalHotelId(
  tx: DrizzleTransaction,
  supplier: string,
  supplierHotelCode: string,
): Promise<string | null> {
  const [existing] = await tx
    .select({
      canonicalHotelId: canonicalHotelSupplierMappings.canonicalHotelId,
    })
    .from(canonicalHotelSupplierMappings)
    .where(
      and(
        eq(canonicalHotelSupplierMappings.supplier, supplier),
        eq(canonicalHotelSupplierMappings.supplierHotelCode, supplierHotelCode),
      ),
    )
    .limit(1)
  return existing?.canonicalHotelId ?? null
}

/**
 * Traite un seul groupe dédupliqué : attache chaque membre EXACT à une
 * identité canonical commune, en créant celle-ci si c'est la toute première
 * fois qu'elle est vue (par n'importe lequel des membres EXACT du groupe).
 * Les membres HIGH/MEDIUM/LOW sont ignorés (voir en-tête de fichier).
 */
async function persistGroup(
  tx: DrizzleTransaction,
  group: DeduplicatedHotelGroup,
): Promise<void> {
  const exactMembers = group.members.filter((m) => m.confidence === "EXACT")
  if (exactMembers.length === 0) return

  let canonicalHotelId: string | null = null

  for (const member of exactMembers) {
    const mapping = member.hotel.supplierMappings[0]
    if (!mapping) continue

    const existingId = await findCanonicalHotelId(
      tx,
      mapping.supplier,
      mapping.supplierHotelCode,
    )
    if (existingId) {
      canonicalHotelId = existingId
      continue
    }

    if (!canonicalHotelId) {
      const [created] = await tx
        .insert(canonicalHotels)
        .values({
          name: member.hotel.name,
          city: member.hotel.city ?? null,
          country: member.hotel.country ?? null,
        })
        .returning({ id: canonicalHotels.id })
      canonicalHotelId = created!.id
    }

    // ON CONFLICT DO NOTHING : filet de sécurité contre une course entre
    // deux recherches concurrentes sur le même (supplier, code) — jamais
    // une deuxième identité canonical pour le même couple.
    await tx
      .insert(canonicalHotelSupplierMappings)
      .values({
        canonicalHotelId,
        supplier: mapping.supplier,
        supplierHotelCode: mapping.supplierHotelCode,
        matchConfidence: member.confidence,
      })
      .onConflictDoNothing()
  }
}

export async function persistCanonicalHotelMappings(
  groups: DeduplicatedHotelGroup[],
  correlationId: string,
): Promise<void> {
  try {
    await withSystemContext(async (tx) => {
      for (const group of groups) {
        await persistGroup(tx, group)
      }
    })
  } catch (error) {
    logger.error(
      "[canonical-hotels.persist] échec best-effort — recherche non affectée",
      {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
      },
    )
  }
}
