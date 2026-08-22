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
import { createPackageDeparture, setPackageDepartureStatus } from "@/lib/admin/packages-actions"
import { packageDepartureSchema, type PackageDepartureInput } from "@/lib/admin/schemas/package-product"

interface Departure {
  id: string
  departureDate: string
  returnDate: string
  adultPriceTnd: string
  childPriceTnd: string | null
  totalSeats: number
  bookedSeats: number
  status: string
}

export function PackageDepartureManager({ productId, departures }: { productId: string; departures: Departure[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const form = useForm<PackageDepartureInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(packageDepartureSchema) as any,
    defaultValues: { departureDate: "", returnDate: "", adultPriceTnd: 0, depositPercent: 30, totalSeats: 20 },
  })

  function onSubmit(data: PackageDepartureInput) {
    startTransition(async () => {
      const result = await createPackageDeparture(productId, data)
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

  function toggleStatus(departureId: string, current: string) {
    startTransition(async () => {
      const result = await setPackageDepartureStatus(departureId, current === "open" ? "closed" : "open")
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label>Départ</Label>
              <Input type="date" {...form.register("departureDate")} />
            </div>
            <div>
              <Label>Retour</Label>
              <Input type="date" {...form.register("returnDate")} />
            </div>
            <div>
              <Label>Prix adulte (DT)</Label>
              <Input type="number" step="0.01" {...form.register("adultPriceTnd", { valueAsNumber: true })} />
            </div>
            <div>
              <Label>Places</Label>
              <Input type="number" min={1} {...form.register("totalSeats", { valueAsNumber: true })} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Ajouter
              </Button>
            </div>
            {form.formState.errors.returnDate ? (
              <p className="text-destructive col-span-full text-xs">{form.formState.errors.returnDate.message}</p>
            ) : null}
          </form>
        ) : null}

        {departures.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun départ programmé — ce produit n&apos;est pas encore réservable.</p>
        ) : (
          <ul className="divide-y">
            {departures.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {d.departureDate} → {d.returnDate}
                </span>
                <span className="text-muted-foreground">
                  {d.bookedSeats}/{d.totalSeats} places — {parseFloat(d.adultPriceTnd).toFixed(3)} DT
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant={d.status === "open" ? "default" : "secondary"}>{d.status}</Badge>
                  <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => toggleStatus(d.id, d.status)}>
                    {d.status === "open" ? "Fermer" : "Rouvrir"}
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
