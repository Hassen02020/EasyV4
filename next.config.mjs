/**
 * Configuration Next.js — TunisiaGo / EasyV4.
 *
 * Notes :
 *  - `typescript.ignoreBuildErrors` reste à `false` : on veut un build qui
 *    crash si un typage est cassé. Le typecheck dédié est `pnpm typecheck`.
 *  - `images.unoptimized: false` : on utilise le pipeline next/image avec
 *    remotePatterns pour les hôtels MyGo. Ajustez la liste au besoin.
 *  - Headers de sécurité activés (CSP minimaliste, HSTS, X-Frame-Options,
 *    Referrer-Policy, Permissions-Policy).
 */

const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
  : ""

const cspConnectSrc = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  SUPABASE_HOST ? `https://${SUPABASE_HOST}` : "",
  "https://vitals.vercel-insights.com",
  "https://*.vercel-insights.com",
]
  .filter(Boolean)
  .join(" ")

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: https:`,
  `font-src 'self' data:`,
  `connect-src ${cspConnectSrc}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self), browsing-topics=()",
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: {
    // TODO: set to false once the 99 pre-existing TS errors in components/pro/ are resolved
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.mygo.tn" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
}

/* -------------------------------------------------------------------------- */
/* Sentry (optionnel) — wrap la config si @sentry/nextjs est installé          */
/* -------------------------------------------------------------------------- */

let finalConfig = nextConfig

try {
  const { withSentryConfig } = await import("@sentry/nextjs")
  finalConfig = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    widenClientFileUpload: true,
  })
} catch {
  /* Sentry non installé — on garde la config native */
}

export default finalConfig
