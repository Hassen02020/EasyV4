/**
 * PREVIEW-PROD-ISOLATION-01 — garde de démarrage : une Preview ne doit jamais
 * atteindre la base de production ni un PSP réel. Fonction pure (env injecté)
 * appelée par validateEnv() ; elle ne renvoie que des noms de variables et des
 * références de projet Supabase (publiques), jamais une valeur secrète.
 *
 * L'environnement est déterminé par VERCEL_ENV, jamais par NODE_ENV (qui vaut
 * "production" aussi en Preview). Hors Vercel (local, CI), aucune règle ajoutée.
 */

/** Projet(s) Supabase de production — référence publique (déjà exposée par
 * NEXT_PUBLIC_SUPABASE_URL côté navigateur). */
export const PRODUCTION_SUPABASE_PROJECT_REFS = [
  "crygnaichvlxavvbifqi",
] as const

const SUPABASE_REF_PATTERN = /^[a-z]{20}$/
const PAYMEE_SANDBOX_HOST = "sandbox.paymee.tn"

type Env = Record<string, string | undefined>

export type DeploymentEnvironment =
  | "production"
  | "preview"
  | "development"
  | "local"
  | "unknown"

export function resolveDeploymentEnvironment(env: Env): DeploymentEnvironment {
  const vercelEnv = env.VERCEL_ENV
  if (vercelEnv !== undefined && vercelEnv !== "") {
    if (
      vercelEnv === "production" ||
      vercelEnv === "preview" ||
      vercelEnv === "development"
    ) {
      return vercelEnv
    }
    return "unknown"
  }
  return env.VERCEL ? "unknown" : "local"
}

/** Référence Supabase désignée par une URL Postgres : hôte direct
 * `db.<ref>.supabase.co` ou utilisateur pooler `<role>.<ref>`. */
export function supabaseRefFromDatabaseUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const direct = url.hostname.match(/^db\.([a-z]{20})\.supabase\.co$/)
  if (direct) return direct[1]
  if (url.hostname.endsWith(".pooler.supabase.com")) {
    const user = decodeURIComponent(url.username)
    const ref = user.slice(user.lastIndexOf(".") + 1)
    return SUPABASE_REF_PATTERN.test(ref) ? ref : null
  }
  return null
}

export function supabaseRefFromApiUrl(raw: string): string | null {
  try {
    const host = new URL(raw).hostname
    const m = host.match(/^([a-z]{20})\.supabase\.co$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function mentionsProductionRef(value: string | undefined): boolean {
  if (!value) return false
  return PRODUCTION_SUPABASE_PROJECT_REFS.some((ref) => value.includes(ref))
}

function checkPreview(env: Env): string[] {
  const errors: string[] = []
  const previewRef = env.PREVIEW_SUPABASE_PROJECT_REF

  if (!previewRef || !SUPABASE_REF_PATTERN.test(previewRef)) {
    errors.push(
      "PREVIEW_SUPABASE_PROJECT_REF : absente ou invalide — une Preview doit déclarer explicitement son projet Supabase dédié",
    )
  } else if (
    (PRODUCTION_SUPABASE_PROJECT_REFS as readonly string[]).includes(previewRef)
  ) {
    errors.push(
      "PREVIEW_SUPABASE_PROJECT_REF : désigne le projet de PRODUCTION — interdit en Preview",
    )
  }

  for (const key of [
    "DATABASE_URL",
    "DATABASE_DIRECT_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
  ]) {
    if (mentionsProductionRef(env[key])) {
      errors.push(`${key} : référence le projet Supabase de PRODUCTION`)
    }
  }

  const checks: Array<[string, (v: string) => string | null, boolean]> = [
    ["DATABASE_URL", supabaseRefFromDatabaseUrl, true],
    ["DATABASE_DIRECT_URL", supabaseRefFromDatabaseUrl, false],
    ["NEXT_PUBLIC_SUPABASE_URL", supabaseRefFromApiUrl, true],
  ]
  for (const [key, extract, required] of checks) {
    const value = env[key]
    if (!value) {
      if (required) errors.push(`${key} : absente`)
      continue
    }
    const ref = extract(value)
    if (ref === null) {
      errors.push(
        `${key} : projet Supabase non identifiable — impossible de prouver qu'il s'agit de la base de Preview`,
      )
    } else if (previewRef && ref !== previewRef) {
      errors.push(
        `${key} : projet « ${ref} » différent de PREVIEW_SUPABASE_PROJECT_REF`,
      )
    }
  }

  if (env.PAYMEE_ENVIRONMENT === "production") {
    errors.push("PAYMEE_ENVIRONMENT=production : interdit en Preview")
  }
  if (env.PAYMEE_API_KEY && env.PAYMEE_ENVIRONMENT !== "sandbox") {
    errors.push(
      "PAYMEE_ENVIRONMENT : doit valoir explicitement « sandbox » quand PAYMEE_API_KEY est définie en Preview",
    )
  }
  if (env.PAYMEE_BASE_URL) {
    let host: string | null = null
    try {
      host = new URL(env.PAYMEE_BASE_URL).hostname
    } catch {
      host = null
    }
    if (host !== PAYMEE_SANDBOX_HOST) {
      errors.push(
        `PAYMEE_BASE_URL : seul ${PAYMEE_SANDBOX_HOST} est autorisé en Preview`,
      )
    }
  }
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    errors.push(
      "STRIPE_SECRET_KEY : seule une clé de test (sk_test_…) est autorisée en Preview",
    )
  }
  if (env.SPS_SECRET_KEY) {
    errors.push(
      "SPS_SECRET_KEY : interdite en Preview (mode test non vérifiable)",
    )
  }

  return errors
}

/** Erreurs bloquantes d'isolation pour l'environnement courant (liste vide =
 * démarrage autorisé). */
export function checkDeploymentIsolation(env: Env): string[] {
  const deployment = resolveDeploymentEnvironment(env)
  if (deployment === "unknown") {
    return [
      "VERCEL_ENV : environnement de déploiement indéterminé (attendu : production, preview ou development)",
    ]
  }
  if (deployment === "preview") return checkPreview(env)
  return []
}
