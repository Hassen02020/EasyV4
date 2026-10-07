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

export type MetaLeadFetchResult =
  | { ok: true; lead: MetaLeadFieldData }
  | { ok: false; code: MetaLeadAdsProviderCode; message?: string }

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

  const apiVersion = process.env.META_GRAPH_API_VERSION || "v21.0"
  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(
    leadgenId,
  )}?access_token=${encodeURIComponent(accessToken)}`

  let response: Response
  try {
    response = await fetch(url, { method: "GET" })
  } catch (err) {
    return {
      ok: false,
      code: "META_LEADADS_FETCH_FAILED",
      message: err instanceof Error ? err.message : String(err),
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      code: "META_LEADADS_FETCH_FAILED",
      message: `Graph API HTTP ${response.status}`,
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
