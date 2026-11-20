/**
 * Attente BORNÉE de la disponibilité d'une route d'un serveur e2e.
 *
 * Succès UNIQUEMENT si la route répond HTTP 200 ET que son contenu est bien
 * celui de la route attendue (`check`). Tout le reste — 404, 500, redirection,
 * 200 d'une AUTRE page, erreur réseau — est une non-disponibilité : on
 * réessaie jusqu'au délai maximal, puis on ÉCHOUE avec un message explicite
 * (dernier statut HTTP ou dernière erreur réseau). Rien n'est avalé.
 *
 * Module sans dépendance Playwright : testable par `node --test`
 * (lib/booking/__tests__/e2e-wait-for-route.test.ts).
 */

export type ProbeResponse = { status: number; body: string }
export type Fetcher = (path: string) => Promise<ProbeResponse>

export interface RouteProbe {
  /** Nom lisible dans le message d'échec. */
  label: string
  path: string
  /** `null` = contenu conforme ; sinon la raison (ex. « route inattendue »). */
  check: (res: ProbeResponse) => string | null
}

export interface WaitOptions {
  timeoutMs?: number
  intervalMs?: number
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export class RouteNotReadyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RouteNotReadyError"
  }
}

/** Délai maximal par défaut, surchargeable par E2E_WARMUP_TIMEOUT_MS. */
export function warmupTimeoutMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env.E2E_WARMUP_TIMEOUT_MS)
  return Number.isFinite(n) && n > 0 ? n : 120_000
}

const snippet = (body: string) =>
  (/<title>([^<]*)<\/title>/.exec(body)?.[1] ?? body)
    .replace(/\s+/g, " ")
    .slice(0, 120)

export async function waitForRoute(
  fetcher: Fetcher,
  probe: RouteProbe,
  opts: WaitOptions = {},
): Promise<{ attempts: number; elapsedMs: number }> {
  const timeoutMs = opts.timeoutMs ?? warmupTimeoutMs()
  const intervalMs = opts.intervalMs ?? 1500
  const now = opts.now ?? Date.now
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const start = now()
  let attempts = 0
  let lastStatus: number | undefined
  let lastNetworkError: string | undefined
  let lastReason = "aucune réponse"
  let lastExcerpt = ""

  for (;;) {
    attempts++
    try {
      const res = await fetcher(probe.path)
      lastStatus = res.status
      lastNetworkError = undefined
      lastExcerpt = snippet(res.body)
      const reason =
        res.status === 200 ? probe.check(res) : `HTTP ${res.status}`
      if (reason === null) return { attempts, elapsedMs: now() - start }
      lastReason = reason
    } catch (err) {
      lastStatus = undefined
      lastNetworkError = err instanceof Error ? err.message : String(err)
      lastReason = "erreur réseau"
    }
    if (now() - start + intervalMs > timeoutMs) break
    await sleep(intervalMs)
  }

  const last =
    lastNetworkError !== undefined
      ? `dernière erreur réseau : ${lastNetworkError.split("\n")[0]}`
      : `dernier statut HTTP : ${lastStatus}`
  throw new RouteNotReadyError(
    `Route e2e non disponible — ${probe.label} (${probe.path.split("?")[0]}) : ` +
      `${attempts} essai(s) en ${now() - start} ms (délai max ${timeoutMs} ms) ; ` +
      `${last} ; raison : ${lastReason}` +
      (lastExcerpt ? ` ; extrait : « ${lastExcerpt} »` : ""),
  )
}
