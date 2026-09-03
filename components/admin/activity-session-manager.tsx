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
import { createActivitySession } from "@/lib/admin/activities-actions"
import { activitySessionSchema, type ActivitySessionInput } from "@/lib/admin/schemas/activity-product"

interface Session {
  id: string
  sessionDate: string
  sessionStart: string
  sessionEnd: string
  capacity: number
  booked: number
  adultPriceTnd: string
  childPriceTnd: string | null
  seniorPriceTnd: string | null
  status: string
}

export function ActivitySessionManager({ productId, sessions }: { productId: string; sessions: Session[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const form = useForm<ActivitySessionInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(activitySessionSchema) as any,
    defaultValues: { sessionDate: "", sessionStart: "", sessionEnd: "", capacity: 20, adultPriceTnd: 0 },
  })

  function onSubmit(data: ActivitySessionInput) {
    startTransition(async () => {
      const result = await createActivitySession(productId, data)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Session ajoutée.")
      setShowForm(false)
      form.reset({ sessionDate: "", sessionStart: "", sessionEnd: "", capacity: 20, adultPriceTnd: 0 })
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Sessions & disponibilité</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
          <CalendarPlus className="mr-1 size-4" /> Ajouter une session
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm ? (
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <Label>Date</Label>
              <Input type="date" {...form.register("sessionDate")} />
            </div>
            <div>
              <Label>Début</Label>
              <Input type="time" {...form.register("sessionStart")} />
            </div>
            <div>
              <Label>Fin</Label>
              <Input type="time" {...form.register("sessionEnd")} />
              {form.formState.errors.sessionEnd ? (
                <p className="text-destructive mt-1 text-xs">{form.formState.errors.sessionEnd.message}</p>
              ) : null}
            </div>
            <div>
              <Label>Capacité</Label>
              <Input type="number" min={1} {...form.register("capacity", { valueAsNumber: true })} />
            </div>
            <div>
              <Label>Prix adulte (DT)</Label>
              <Input type="number" step="0.01" {...form.register("adultPriceTnd", { valueAsNumber: true })} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Ajouter
              </Button>
            </div>
            <div>
              <Label>Prix enfant (DT, optionnel)</Label>
              <Input type="number" step="0.01" {...form.register("childPriceTnd", { valueAsNumber: true })} />
            </div>
            <div>
              <Label>Prix senior (DT, optionnel)</Label>
              <Input type="number" step="0.01" {...form.register("seniorPriceTnd", { valueAsNumber: true })} />
            </div>
          </form>
        ) : null}

        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune session programmée — cette attraction n&apos;est pas encore réservable.</p>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {s.sessionDate} · {s.sessionStart}–{s.sessionEnd}
                </span>
                <span className="text-muted-foreground">
                  {s.booked}/{s.capacity} places — {parseFloat(s.adultPriceTnd).toFixed(3)} DT
                </span>
                <Badge variant={s.status === "open" ? "default" : "secondary"}>{s.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
