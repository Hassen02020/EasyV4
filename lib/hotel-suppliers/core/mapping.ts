/**
 * Identité hôtel normalisée — un hôtel Easy2Book ("hotel_master") peut être
 * vendu par plusieurs fournisseurs, chacun avec son propre code
 * ("hotel_supplier_mapping"). Ce module ne persiste rien en base — il ne
 * fait que calculer, à partir de deux hôtels normalisés, si ce sont
 * probablement le même établissement, et avec quelle confiance. La
 * persistance (table hotel_master / hotel_supplier_mapping) est un travail
 * de schéma distinct, hors scope tant qu'un second fournisseur réel n'est
 * pas branché — voir le rapport final, section "Remaining gaps".
 */

import type { NormalizedHotel, SupplierName } from "./types"

export type MatchConfidence = "EXACT" | "HIGH" | "MEDIUM" | "LOW" | "UNMATCHED"

export interface HotelMatchResult {
  confidence: MatchConfidence
  reasons: string[]
}

/** Rayon (mètres) sous lequel deux coordonnées sont considérées "au même endroit". */
const GEO_EXACT_METERS = 50
const GEO_CLOSE_METERS = 300

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const setA = new Set(na.split(" "))
  const setB = new Set(nb.split(" "))
  const intersection = [...setA].filter((w) => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : intersection / union
}

/**
 * Priorité de correspondance imposée par la mission :
 * 1. mapping explicite déjà connu (appelant, avant ce module)
 * 2. coordonnées géographiques
 * 3. destination/ville
 * 4. nom normalisé
 * 5. adresse
 * 6. code postal (non modélisé aujourd'hui — MyGo ne le retourne pas)
 * 7. vérification manuelle (jamais automatique en dessous de LOW)
 */
export function matchHotels(a: NormalizedHotel, b: NormalizedHotel): HotelMatchResult {
  const reasons: string[] = []

  const explicitOverlap = a.supplierMappings.some((am) =>
    b.supplierMappings.some((bm) => am.supplier === bm.supplier && am.supplierHotelCode === bm.supplierHotelCode),
  )
  if (explicitOverlap) {
    return { confidence: "EXACT", reasons: ["explicit supplier mapping already shared"] }
  }

  let geoMeters: number | null = null
  if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
    geoMeters = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude)
  }

  const sameCity =
    a.city != null && b.city != null && normalizeName(a.city) === normalizeName(b.city)
  const similarity = nameSimilarity(a.name, b.name)
  const sameAddress =
    a.address != null && b.address != null && normalizeName(a.address) === normalizeName(b.address)

  if (geoMeters != null && geoMeters <= GEO_EXACT_METERS && similarity >= 0.6) {
    reasons.push(`geo within ${Math.round(geoMeters)}m`, `name similarity ${similarity.toFixed(2)}`)
    return { confidence: "EXACT", reasons }
  }

  if (geoMeters != null && geoMeters <= GEO_CLOSE_METERS && similarity >= 0.5) {
    reasons.push(`geo within ${Math.round(geoMeters)}m`, `name similarity ${similarity.toFixed(2)}`)
    return { confidence: "HIGH", reasons }
  }

  if (sameCity && similarity >= 0.75) {
    reasons.push("same city", `name similarity ${similarity.toFixed(2)}`)
    return { confidence: "HIGH", reasons }
  }

  if (sameCity && sameAddress) {
    reasons.push("same city", "same normalized address")
    return { confidence: "HIGH", reasons }
  }

  if (sameCity && similarity >= 0.4) {
    reasons.push("same city", `name similarity ${similarity.toFixed(2)}`)
    return { confidence: "MEDIUM", reasons }
  }

  if (similarity >= 0.4) {
    reasons.push(`name similarity ${similarity.toFixed(2)} (no city/geo confirmation)`)
    return { confidence: "LOW", reasons }
  }

  return { confidence: "UNMATCHED", reasons: ["no signal above threshold"] }
}

/** Ne fusionne JAMAIS automatiquement en dessous de MEDIUM — LOW/UNMATCHED restent des hôtels distincts tant qu'aucune vérification manuelle n'a eu lieu. */
export function isAutoMergeable(confidence: MatchConfidence): boolean {
  return confidence === "EXACT" || confidence === "HIGH" || confidence === "MEDIUM"
}

export interface SupplierMappingRow {
  supplier: SupplierName
  supplierHotelCode: string
  confidence: MatchConfidence
}
