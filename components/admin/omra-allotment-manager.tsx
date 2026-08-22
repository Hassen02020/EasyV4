"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CalendarPlus, Loader2 } from "lucide-react"
import { createOmraDeparture, setOmraDepartureStatus } from "@/lib/admin/omra-product-actions"
import { omraDepartureSchema, type OmraDepartureInput } from "@/lib/admin/schemas/omra-product"

interface Allotment {
  id: string
  departureDate: string
  totalCapacity: number
  availableCount: number
  overridePrice: string | null
  status: string
}

export function OmraAllotmentManager({ productId, allotments }: { productId: string; allotments: Allotment[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const form = useForm<OmraDepartureInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(omraDepartureSchema) as any,
    defaultValues: { departureDate: "", totalCapacity: 45 },
  })

  function onSubmit(data: OmraDepartureInput) {
    startTransition(async () => {
      const result = await createOmraDeparture(productId, data)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Départ ajouté.")
      setShowForm(false)
      form.reset()
      router.refresh()
    })
  }

  function toggleStatus(allotmentId: string, current: string) {
    startTransition(async () => {
      const result = await setOmraDepartureStatus(allotmentId, current === "active" ? "closed" : "active")
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Départs & disponibilité</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          <CalendarPlus className="mr-1 size-4" /> Ajouter un départ
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm ? (
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Date de départ</Label>
              <Input type="date" {...form.register("departureDate")} />
            </div>
            <div>
              <Label>Capacité</Label>
              <Input type="number" min={1} {...form.register("totalCapacity", { valueAsNumber: true })} />
            </div>
            <div>
              <Label>Prix spécifique (optionnel)</Label>
              <Input type="number" step="0.001" {...form.register("overridePrice", { valueAsNumber: true })} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Ajouter
              </Button>
            </div>
          </form>
        ) : null}

        {allotments.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun départ programmé — ce programme n&apos;est pas encore réservable.</p>
        ) : (
          <ul className="divide-y">
            {allotments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{a.departureDate}</span>
                <span className="text-muted-foreground">
                  {a.availableCount}/{a.totalCapacity} places {a.overridePrice ? `— ${parseFloat(a.overridePrice).toFixed(3)} DT` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={a.status === "active" ? "default" : "secondary"}>{a.status}</Badge>
                  <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => toggleStatus(a.id, a.status)}>
                    {a.status === "active" ? "Fermer" : "Rouvrir"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
