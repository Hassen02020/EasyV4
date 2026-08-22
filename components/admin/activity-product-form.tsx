"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2 } from "lucide-react"
import { createActivityProduct } from "@/lib/admin/activities-actions"
import { activityProductSchema, type ActivityProductInput } from "@/lib/admin/schemas/activity-product"
import { PRODUCT_CHANNELS } from "@/lib/admin/product-constants"

const CHANNEL_LABEL: Record<string, string> = { b2c: "B2C (grand public)", b2b: "B2B (agences)", white_label: "Marque blanche" }

export function ActivityProductForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<ActivityProductInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(activityProductSchema) as any,
    defaultValues: {
      code: "",
      title: "",
      location: "",
      shortDescription: "",
      longDescription: "",
      durationMinutes: 240,
      coverImage: "",
      galleryUrls: [],
      inclusions: [],
      exclusions: [],
      channels: ["b2c"],
    },
  })

  const channels = useWatch({ control: form.control, name: "channels" })

  function toggleChannel(channel: string, checked: boolean) {
    const next = checked ? [...channels, channel] : channels.filter((c) => c !== channel)
    form.setValue("channels", next as ActivityProductInput["channels"])
  }

  async function onSubmit(data: ActivityProductInput) {
    setIsSubmitting(true)
    const result = await createActivityProduct(data)
    setIsSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success("Attraction créée en brouillon.")
    router.push("/admin/products")
    router.refresh()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Général</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Code produit *</Label>
              <Input {...form.register("code")} placeholder="TAB-EXC" className="mt-1" />
              {form.formState.errors.code ? <p className="text-destructive mt-1 text-xs">{form.formState.errors.code.message}</p> : null}
            </div>
            <div>
              <Label>Titre *</Label>
              <Input {...form.register("title")} placeholder="Excursion Tabarka" className="mt-1" />
              {form.formState.errors.title ? <p className="text-destructive mt-1 text-xs">{form.formState.errors.title.message}</p> : null}
            </div>
          </div>
          <div>
            <Label>Lieu</Label>
            <Input {...form.register("location")} placeholder="Tabarka" className="mt-1" />
          </div>
          <div>
            <Label>Description courte</Label>
            <Textarea {...form.register("shortDescription")} className="mt-1" rows={2} />
          </div>
          <div>
            <Label>Description longue</Label>
            <Textarea {...form.register("longDescription")} className="mt-1" rows={5} />
          </div>
          <div>
            <Label>Durée (minutes) *</Label>
            <Input type="number" min={1} {...form.register("durationMinutes", { valueAsNumber: true })} className="mt-1 w-40" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Médias</CardTitle></CardHeader>
        <CardContent>
          <Label>Image de couverture (URL)</Label>
          <Input {...form.register("coverImage")} placeholder="https://..." className="mt-1" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Canaux de vente</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {PRODUCT_CHANNELS.map((c) => (
            <div key={c} className="flex items-center gap-2">
              <Checkbox id={`channel-${c}`} checked={channels.includes(c)} onCheckedChange={(v) => toggleChannel(c, Boolean(v))} />
              <Label htmlFor={`channel-${c}`}>{CHANNEL_LABEL[c]}</Label>
            </div>
          ))}
          {form.formState.errors.channels ? <p className="text-destructive text-xs">{form.formState.errors.channels.message}</p> : null}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        Créer en brouillon
      </Button>
    </form>
  )
}
