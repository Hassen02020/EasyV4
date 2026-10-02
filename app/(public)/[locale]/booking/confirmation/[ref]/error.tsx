"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ConfirmationError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[booking/confirmation/error.tsx]", error)
  }, [error])

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="bg-destructive/10 mx-auto flex h-14 w-14 items-center justify-center rounded-full">
          <AlertTriangle className="text-destructive h-7 w-7" />
        </div>
        <h1 className="text-foreground mt-4 text-xl font-bold">
          Impossible d&apos;afficher votre confirmation
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Une erreur est survenue. Votre réservation est enregistrée — un email
          de confirmation vous a été envoyé.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
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
