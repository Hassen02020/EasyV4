/**
 * META-LEADADS-WEBHOOK-01 — récupération du détail d'un lead Meta Lead Ads.
 *
 * Le webhook `leadgen` (app/api/webhooks/meta-leadads/route.ts) ne
 * transporte JAMAIS les données du lead lui-même (email/téléphone/
 * réponses) — uniquement un `leadgen_id` — par conception Meta (le
 * contenu doit être récupéré séparément, avec un Page Access Token,
 * documenté ici : https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving).
 * Ce fichier fait cet appel Graph API séparé, jamais inventé.
 *
 * Comportement honnête tant que `META_PAGE_ACCESS_TOKEN` n'est pas
 * configuré : `META_LEADADS_PROVIDER_NOT_CONFIGURED` — jamais un faux
 * succès, même discipline que lib/whatsapp/provider.ts.
 */

import { metaGraphUrl } from "@/lib/meta/graph"

/** Champs Graph demandés pour un lead (seuls ceux réellement utilisés). */
export const LEAD_FIELDS = "id,created_time,field_data"

export type MetaLeadAdsProviderCode =
  | "META_LEADADS_PROVIDER_NOT_CONFIGURED"
  | "META_LEADADS_FETCH_FAILED"

export interface MetaLeadFieldData {
  leadgenId: string
  /** Première valeur de chaque champ du formulaire — Meta retourne un
   * tableau `values` par champ, jamais interprété au-delà de la première
   * valeur ici (cas réel : un champ de formulaire Lead Ads est à réponse
   * unique, pas une liste). */
  fields: Record<string, string>
  createdTime: string | null
}

/**
 * META-CRM-E2E-01 (P1-2) — diagnostic d'un échec Graph sans donnée
 * sensible : seuls le code, le sous-code, le type et l'identifiant de
 * trace Meta sont conservés (jamais le message brut, jamais l'URL ni le
 * jeton). Valeurs filtrées par forme : un champ inattendu est ignoré.
 */
export interface MetaGraphErrorInfo {
  status: number
  code?: number
  subcode?: number
  type?: string
  fbtraceId?: string
}

export type MetaLeadFetchResult =
  | { ok: true; lead: MetaLeadFieldData }
  | {
      ok: false
      code: MetaLeadAdsProviderCode
      message?: string
      graph?: MetaGraphErrorInfo
    }

export function parseMetaGraphError(
  status: number,
  body: unknown,
): MetaGraphErrorInfo {
  const info: MetaGraphErrorInfo = { status }
  const err =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: unknown }).error
      : null
  if (!err || typeof err !== "object") return info
  const e = err as Record<string, unknown>
  if (Number.isInteger(e.code)) info.code = e.code as number
  if (Number.isInteger(e.error_subcode))
    info.subcode = e.error_subcode as number
  if (typeof e.type === "string" && /^[A-Za-z]{1,64}$/.test(e.type))
    info.type = e.type
  if (
    typeof e.fbtrace_id === "string" &&
    /^[A-Za-z0-9_-]{1,64}$/.test(e.fbtrace_id)
  )
    info.fbtraceId = e.fbtrace_id
  return info
}

interface GraphApiFieldDatum {
  name: string
  values: string[]
}

interface GraphApiLeadResponse {
  id: string
  created_time?: string
  field_data?: GraphApiFieldDatum[]
}

export function isMetaLeadAdsConfigured(): boolean {
  return Boolean(process.env.META_PAGE_ACCESS_TOKEN)
}

/**
 * Appel Graph API réel (jamais simulé) — aucun "mode virtuel"/démo ici,
 * contrairement aux moteurs de recherche fournisseur (hôtels/vols) : un
 * lead Meta sans accès Graph API réel n'a tout simplement aucune donnée à
 * offrir, il n'y a pas de fallback honnête possible autre que l'échec
 * explicite.
 */
export async function fetchMetaLeadFieldDataCore(
  leadgenId: string,
): Promise<MetaLeadFetchResult> {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN
  if (!accessToken) {
    return { ok: false, code: "META_LEADADS_PROVIDER_NOT_CONFIGURED" }
  }

  // Champs demandés explicitement (CRM-META-CONNECT-01) : ne pas dépendre
  // des champs renvoyés par défaut par Graph. META-CRM-E2E-01 (P2-1) : le
  // jeton part dans l'en-tête Authorization, jamais dans l'URL (qui peut
  // apparaître dans un message d'erreur ou un journal).
  const url = `${metaGraphUrl(encodeURIComponent(leadgenId))}?fields=${LEAD_FIELDS}`

  let response: Response
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  } catch (err) {
    return {
      ok: false,
      code: "META_LEADADS_FETCH_FAILED",
      message: err instanceof Error ? err.message : String(err),
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    return {
      ok: false,
      code: "META_LEADADS_FETCH_FAILED",
      message: `Graph API HTTP ${response.status}`,
      graph: parseMetaGraphError(response.status, errorBody),
    }
  }

  const body = (await response.json()) as GraphApiLeadResponse
  const fields: Record<string, string> = {}
  for (const datum of body.field_data ?? []) {
    const first = datum.values?.[0]
    if (first !== undefined) fields[datum.name] = first
  }

  return {
    ok: true,
    lead: {
      leadgenId: body.id,
      fields,
      createdTime: body.created_time ?? null,
    },
  }
}
