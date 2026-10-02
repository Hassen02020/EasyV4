"use client"

/**
 * JOURNEY-BUILDER-01 — liste des Journeys (/pro/journeys, réutilisé par
 * /admin/journeys). Même composant pour les deux — pas de deuxième
 * Journey Builder.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Journey } from "@/lib/db/schema"
import { createJourney } from "@/lib/journeys/journey-actions"

const JOURNEY_STATUS_LABEL: Record<Journey["status"], string> = {
  draft: "Brouillon",
  ready: "Prête à confirmer",
  processing: "Confirmation en cours",
  confirmed: "Confirmée",
  partially_confirmed: "Partiellement confirmée",
  failed: "Échec",
}

interface Props {
  journeys: Journey[]
  /** Fourni uniquement côté /admin — l'agence pour laquelle le staff compose. */
  agencyId?: string
  basePath: string // "/pro/journeys" ou "/admin/journeys"
}

export function JourneysList({ journeys, agencyId, basePath }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")

  function handleCreate() {
    startTransition(async () => {
      const result = await createJourney({
        agencyId,
        title: title || undefined,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setOpen(false)
      setTitle("")
      router.push(`${basePath}/${result.journeyId}`)
    })
  }

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="mr-2 h-4 w-4" /> Nouveau Journey
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau Journey</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Titre (optionnel)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button
              onClick={handleCreate}
              disabled={isPending}
              className="w-full"
            >
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Créer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        {journeys.map((j) => (
          <Card
            key={j.id}
            className="cursor-pointer"
            onClick={() => router.push(`${basePath}/${j.id}`)}
          >
            <CardContent className="flex items-center justify-between p-4">
              <p className="font-medium">{j.title ?? "Sans titre"}</p>
              <Badge variant="outline">{JOURNEY_STATUS_LABEL[j.status]}</Badge>
            </CardContent>
          </Card>
        ))}
        {journeys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun Journey pour le moment.
          </p>
        ) : null}
      </div>
    </div>
  )
}
