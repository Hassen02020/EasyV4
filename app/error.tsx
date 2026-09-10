"use client"

/**
 * PHASE 30 — frontière d'erreur globale (Next.js App Router). Manquait
 * entièrement (aucun `app/error.tsx` nulle part dans le dépôt, confirmé
 * pendant l'audit) : une exception de rendu non interceptée localement
 * remontait jusqu'à l'écran d'erreur générique non stylé de Next.js plutôt
 * que cette page — jamais de fausse donnée affichée, juste un état
 * d'erreur honnête et cohérent avec l'identité visuelle Easy2Book.
 */
import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[app/error.tsx]", error)
  }, [error])

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="bg-destructive/10 mx-auto flex h-14 w-14 items-center justify-center rounded-full">
          <AlertTriangle className="text-destructive h-7 w-7" />
        </div>
        <h1 className="text-foreground mt-4 text-xl font-bold">
          Une erreur inattendue s&apos;est produite
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Nos équipes ont été notifiées. Vous pouvez réessayer ou revenir à
          l&apos;accueil.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => reset()}>
            Réessayer
          </Button>
          <Button asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
