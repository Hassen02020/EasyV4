/**
 * LEARNING-01 — "Est-ce que ça a marché ?"
 *
 * Quatrième étage du programme Radar :
 *   SIGNAL ENGINE → ACTION ENGINE → LEARNING ENGINE
 *   "Ce VIP a-t-il finalement converti ?"
 *
 * Portée strictement limitée :
 *  - fonction pure, aucune DB, aucune persistance ;
 *  - entrée : leads scorés + fenêtre temporelle ;
 *  - mesure la conversion (status="converted") par bucket VIP ;
 *  - corrélation vipScore → conversion comme signal de calibration ;
 *  - aucune nouvelle table, aucune migration.
 */

export type VipBucket = "vip_pp" | "vip_p" | "pipeline" | "faible"

export interface LeadWithScore {
  id: string
  firstName: string
  lastName: string | null
  vipScore: number
  status: string
  productType: string
  destination: string | null
  createdAt: Date
  convertedAt: Date | null
}

export interface BucketStats {
  bucket: VipBucket
  label: string
  minScore: number
  total: number
  converted: number
  rate: number
}

export interface DimensionStats {
  dimension: string
  dimensionType: "destination" | "productType"
  total: number
  converted: number
  rate: number
}

export interface ConvertedRow {
  id: string
  firstName: string
  lastName: string | null
  vipScore: number
  productType: string
  destination: string | null
  convertedAt: Date
  daysToConvert: number
}

export interface LearningStats {
  windowWeeks: number
  totalLeads: number
  convertedLeads: number
  overallRate: number
  byBucket: BucketStats[]
  byDestination: DimensionStats[]
  byProduct: DimensionStats[]
  avgDaysToConvert: number | null
  topConverted: ConvertedRow[]
}

/* -------------------------------------------------------------------------- */
/* Seuils VIP                                                                  */
/* -------------------------------------------------------------------------- */

const VIP_BUCKETS: { bucket: VipBucket; label: string; minScore: number }[] = [
  { bucket: "vip_pp", label: "VIP++", minScore: 80 },
  { bucket: "vip_p", label: "VIP+", minScore: 50 },
  { bucket: "pipeline", label: "Pipeline", minScore: 25 },
  { bucket: "faible", label: "Faible", minScore: 0 },
]

function deriveBucket(vipScore: number): VipBucket {
  for (const { bucket, minScore } of VIP_BUCKETS) {
    if (vipScore >= minScore) return bucket
  }
  return "faible"
}

function daysApart(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000)
}

/* -------------------------------------------------------------------------- */
/* Core                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fonction pure — mesure la conversion des leads scorés sur la fenêtre.
 * Les leads passés doivent déjà être filtrés sur la fenêtre temporelle.
 */
export function buildLearningCore(
  leads: LeadWithScore[],
  windowWeeks: number,
): LearningStats {
  const totalLeads = leads.length
  const converted = leads.filter((l) => l.status === "converted")
  const convertedLeads = converted.length
  const overallRate =
    totalLeads === 0 ? 0 : Math.round((convertedLeads / totalLeads) * 100)

  /* ── Buckets ──────────────────────────────────────────────────────── */
  const byBucket: BucketStats[] = VIP_BUCKETS.map(
    ({ bucket, label, minScore }) => {
      const group = leads.filter((l) => deriveBucket(l.vipScore) === bucket)
      const conv = group.filter((l) => l.status === "converted").length
      return {
        bucket,
        label,
        minScore,
        total: group.length,
        converted: conv,
        rate: group.length === 0 ? 0 : Math.round((conv / group.length) * 100),
      }
    },
  )

  /* ── Destinations ─────────────────────────────────────────────────── */
  const destMap = new Map<string, { total: number; converted: number }>()
  for (const l of leads) {
    const dest = l.destination
    if (!dest) continue
    const cur = destMap.get(dest) ?? { total: 0, converted: 0 }
    cur.total += 1
    if (l.status === "converted") cur.converted += 1
    destMap.set(dest, cur)
  }
  const byDestination: DimensionStats[] = Array.from(destMap.entries())
    .map(([dimension, { total, converted: conv }]) => ({
      dimension,
      dimensionType: "destination" as const,
      total,
      converted: conv,
      rate: Math.round((conv / total) * 100),
    }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
    .slice(0, 10)

  /* ── Produits ─────────────────────────────────────────────────────── */
  const prodMap = new Map<string, { total: number; converted: number }>()
  for (const l of leads) {
    const cur = prodMap.get(l.productType) ?? { total: 0, converted: 0 }
    cur.total += 1
    if (l.status === "converted") cur.converted += 1
    prodMap.set(l.productType, cur)
  }
  const byProduct: DimensionStats[] = Array.from(prodMap.entries())
    .map(([dimension, { total, converted: conv }]) => ({
      dimension,
      dimensionType: "productType" as const,
      total,
      converted: conv,
      rate: Math.round((conv / total) * 100),
    }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)

  /* ── Timeline ─────────────────────────────────────────────────────── */
  const daysArray = converted
    .filter((l) => l.convertedAt !== null)
    .map((l) => daysApart(l.createdAt, l.convertedAt!))

  const avgDaysToConvert =
    daysArray.length === 0
      ? null
      : Math.round(daysArray.reduce((s, d) => s + d, 0) / daysArray.length)

  /* ── Top convertis ────────────────────────────────────────────────── */
  const topConverted: ConvertedRow[] = converted
    .filter((l) => l.convertedAt !== null)
    .map((l) => ({
      id: l.id,
      firstName: l.firstName,
      lastName: l.lastName,
      vipScore: l.vipScore,
      productType: l.productType,
      destination: l.destination,
      convertedAt: l.convertedAt!,
      daysToConvert: daysApart(l.createdAt, l.convertedAt!),
    }))
    .sort((a, b) => b.vipScore - a.vipScore)
    .slice(0, 20)

  return {
    windowWeeks,
    totalLeads,
    convertedLeads,
    overallRate,
    byBucket,
    byDestination,
    byProduct,
    avgDaysToConvert,
    topConverted,
  }
}

export const VIP_BUCKET_LABELS: Record<VipBucket, string> = {
  vip_pp: "VIP++",
  vip_p: "VIP+",
  pipeline: "Pipeline",
  faible: "Faible",
}
