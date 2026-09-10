"use client"

/**
 * PHASE 30 — filet de sécurité pour une erreur dans app/layout.tsx
 * lui-même (jamais interceptée par app/error.tsx, qui ne couvre que les
 * enfants du layout racine — convention Next.js App Router). Doit fournir
 * son propre <html>/<body> : le layout racine, potentiellement fautif,
 * n'est plus monté quand celui-ci s'affiche.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "#0a0a0a",
            color: "#fafafa",
          }}
        >
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>
              Une erreur critique s&apos;est produite
            </h1>
            <p style={{ marginTop: 8, fontSize: "0.875rem", opacity: 0.7 }}>
              Merci de réessayer dans quelques instants.
            </p>
            <button
              onClick={() => reset()}
              style={{
                marginTop: 24,
                padding: "0.5rem 1.25rem",
                borderRadius: 8,
                border: "1px solid #333",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
