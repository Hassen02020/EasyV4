"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, Home, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function PublicLocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[public/[locale]/error.tsx]", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col">
      {/* Minimal header stand-in so nav stays accessible */}
      <div className="bg-background h-16 border-b" />

      <main className="bg-muted/30 flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <div className="bg-destructive/10 mx-auto flex h-16 w-16 items-center justify-center rounded-full">
            <AlertTriangle className="text-destructive h-8 w-8" />
          </div>

          <h1 className="text-foreground mt-6 text-2xl font-bold">
            Une erreur s&apos;est produite
          </h1>

          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Cette page a rencontré un problème inattendu. Vous pouvez réessayer
            ou revenir à l&apos;accueil pour continuer votre recherche.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => reset()}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Réessayer
            </Button>
            <Button asChild>
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                Accueil
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
