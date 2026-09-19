"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { submitMutuelleRequest } from "@/lib/mutuelle/requests-actions"

const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: "hotel", label: "Hôtel Tunisie" },
  { value: "hotel_monde", label: "Hôtel Monde" },
  { value: "flight", label: "Vol" },
  { value: "package", label: "Voyage organisé" },
  { value: "activity", label: "Activité / Attraction" },
  { value: "transfer", label: "Transfert" },
  { value: "omra", label: "Omra" },
  { value: "car", label: "Location de voiture" },
]

export function NewRequestForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [module, setModule] = useState("hotel")
  const [description, setDescription] = useState("")
  const [travelStartDate, setTravelStartDate] = useState("")
  const [travelEndDate, setTravelEndDate] = useState("")
  const [paxCount, setPaxCount] = useState("1")

  function reset() {
    setDescription("")
    setTravelStartDate("")
    setTravelEndDate("")
    setPaxCount("1")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await submitMutuelleRequest({
        module,
        description,
        travelStartDate,
        travelEndDate,
        paxCount: Number(paxCount),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Demande envoyée à votre directeur.")
      reset()
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nouvelle demande</CardTitle>
        <CardDescription>
          Décrivez votre besoin — votre directeur la validera avant transmission.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="request-module">Type de prestation</Label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger id="request-module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="request-pax">Nombre de personnes</Label>
              <Input
                id="request-pax"
                type="number"
                min={1}
                max={50}
                value={paxCount}
                onChange={(e) => setPaxCount(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="request-start">Date de départ</Label>
              <Input
                id="request-start"
                type="date"
                value={travelStartDate}
                onChange={(e) => setTravelStartDate(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="request-end">Date de retour</Label>
              <Input
                id="request-end"
                type="date"
                value={travelEndDate}
                min={travelStartDate || undefined}
                onChange={(e) => setTravelEndDate(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="request-description">Description</Label>
            <Textarea
              id="request-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. Hôtel 4* à Hammamet, chambre double, pension complète..."
              required
              disabled={isPending}
              className="min-h-24"
            />
          </div>

          {error && <p className="text-destructive text-sm font-medium">{error}</p>}

          <Button type="submit" disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer la demande
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
