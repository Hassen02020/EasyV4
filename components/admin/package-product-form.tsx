"use client"

/**
 * Formulaire Master Admin — création/édition d'un produit Voyage Organisé.
 *
 * Une seule page avec des sections claires plutôt qu'un wizard multi-étapes
 * (GENERAL → MEDIA → DATES → ... → PUBLISH demandé par la mission) : choix
 * délibéré compte tenu du temps disponible pour cette phase — toutes les
 * données requises sont capturées, seule la présentation diffère d'un
 * assistant pas-à-pas. Documenté dans le rapport Phase 13.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, useFieldArray, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { createPackageProduct, updatePackageProduct } from "@/lib/admin/packages-actions"
import { packageProductSchema, type PackageProductInput } from "@/lib/admin/schemas/package-product"
import { PRODUCT_CHANNELS } from "@/lib/admin/product-constants"

const CHANNEL_LABEL: Record<string, string> = { b2c: "B2C (grand public)", b2b: "B2B (agences)", white_label: "Marque blanche" }

export function PackageProductForm({
  productId,
  initial,
}: {
  productId?: string
  initial?: Partial<PackageProductInput>
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<PackageProductInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(packageProductSchema) as any,
    defaultValues: {
      code: initial?.code ?? "",
      title: initial?.title ?? "",
      shortDescription: initial?.shortDescription ?? "",
      longDescription: initial?.longDescription ?? "",
      itinerary: initial?.itinerary ?? [],
      coverImage: initial?.coverImage ?? "",
      galleryUrls: initial?.galleryUrls ?? [],
      departureLocations: initial?.departureLocations ?? [],
      transportMode: initial?.transportMode ?? "",
      durationDays: initial?.durationDays ?? 7,
      durationNights: initial?.durationNights ?? 6,
      inclusions: initial?.inclusions ?? [],
      exclusions: initial?.exclusions ?? [],
      channels: initial?.channels ?? ["b2c"],
    },
  })

  const itinerary = useFieldArray({ control: form.control, name: "itinerary" })
  const channels = useWatch({ control: form.control, name: "channels" })
  const inclusions = useWatch({ control: form.control, name: "inclusions" })
  const exclusions = useWatch({ control: form.control, name: "exclusions" })
  const departureLocations = useWatch({ control: form.control, name: "departureLocations" })
  const galleryUrls = useWatch({ control: form.control, name: "galleryUrls" })

  function toggleChannel(channel: string, checked: boolean) {
    const next = checked ? [...channels, channel] : channels.filter((c) => c !== channel)
    form.setValue("channels", next as PackageProductInput["channels"])
  }

  function addListItem(field: "inclusions" | "exclusions" | "departureLocations" | "galleryUrls") {
    const current = form.getValues(field)
    form.setValue(field, [...current, ""])
  }

  function updateListItem(field: "inclusions" | "exclusions" | "departureLocations" | "galleryUrls", index: number, value: string) {
    const current = [...form.getValues(field)]
    current[index] = value
    form.setValue(field, current)
  }

  function removeListItem(field: "inclusions" | "exclusions" | "departureLocations" | "galleryUrls", index: number) {
    form.setValue(field, form.getValues(field).filter((_, i) => i !== index))
  }

  async function onSubmit(data: PackageProductInput) {
    setIsSubmitting(true)
    const cleaned = {
      ...data,
      inclusions: data.inclusions.filter(Boolean),
      exclusions: data.exclusions.filter(Boolean),
      departureLocations: data.departureLocations.filter(Boolean),
      galleryUrls: data.galleryUrls.filter(Boolean),
    }
    const result = productId
      ? await updatePackageProduct(productId, cleaned)
      : await createPackageProduct(cleaned)
    setIsSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(productId ? "Produit mis à jour." : "Produit créé en brouillon.")
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
              <Input {...form.register("code")} placeholder="IST-5J" className="mt-1" />
              {form.formState.errors.code ? <p className="text-destructive mt-1 text-xs">{form.formState.errors.code.message}</p> : null}
            </div>
            <div>
              <Label>Titre *</Label>
              <Input {...form.register("title")} placeholder="Istanbul Découverte" className="mt-1" />
              {form.formState.errors.title ? <p className="text-destructive mt-1 text-xs">{form.formState.errors.title.message}</p> : null}
            </div>
          </div>
          <div>
            <Label>Description courte</Label>
            <Textarea {...form.register("shortDescription")} className="mt-1" rows={2} />
          </div>
          <div>
            <Label>Description longue</Label>
            <Textarea {...form.register("longDescription")} className="mt-1" rows={5} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Médias</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Image de couverture (URL)</Label>
            <Input {...form.register("coverImage")} placeholder="https://..." className="mt-1" />
          </div>
          <ListEditor
            label="Galerie (URLs)"
            items={galleryUrls}
            onAdd={() => addListItem("galleryUrls")}
            onUpdate={(i, v) => updateListItem("galleryUrls", i, v)}
            onRemove={(i) => removeListItem("galleryUrls", i)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Durée & transport</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Jours *</Label>
              <Input type="number" min={1} {...form.register("durationDays", { valueAsNumber: true })} className="mt-1" />
            </div>
            <div>
              <Label>Nuits *</Label>
              <Input type="number" min={0} {...form.register("durationNights", { valueAsNumber: true })} className="mt-1" />
            </div>
            <div>
              <Label>Mode de transport</Label>
              <Input {...form.register("transportMode")} placeholder="Avion + Bus" className="mt-1" />
            </div>
          </div>
          <ListEditor
            label="Lieux de départ"
            items={departureLocations}
            onAdd={() => addListItem("departureLocations")}
            onUpdate={(i, v) => updateListItem("departureLocations", i, v)}
            onRemove={(i) => removeListItem("departureLocations", i)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Itinéraire</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {itinerary.fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="flex-1 space-y-2">
                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <Input type="number" min={1} placeholder="Jour" {...form.register(`itinerary.${index}.day`, { valueAsNumber: true })} />
                  <Input placeholder="Titre de l'étape" {...form.register(`itinerary.${index}.title`)} />
                </div>
                <Textarea placeholder="Description" rows={2} {...form.register(`itinerary.${index}.description`)} />
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => itinerary.remove(index)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => itinerary.append({ day: itinerary.fields.length + 1, title: "", description: "" })}>
            <Plus className="mr-1 size-4" /> Ajouter une étape
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Inclus / Non inclus</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ListEditor label="Inclus" items={inclusions} onAdd={() => addListItem("inclusions")} onUpdate={(i, v) => updateListItem("inclusions", i, v)} onRemove={(i) => removeListItem("inclusions", i)} />
          <ListEditor label="Non inclus" items={exclusions} onAdd={() => addListItem("exclusions")} onUpdate={(i, v) => updateListItem("exclusions", i, v)} onRemove={(i) => removeListItem("exclusions", i)} />
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
        {productId ? "Enregistrer" : "Créer en brouillon"}
      </Button>
    </form>
  )
}

function ListEditor({
  label,
  items,
  onAdd,
  onUpdate,
  onRemove,
}: {
  label: string
  items: string[]
  onAdd: () => void
  onUpdate: (i: number, v: string) => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {items.map((item, i) => (
        <div key={i} className="flex gap-2">
          <Input value={item} onChange={(e) => onUpdate(i, e.target.value)} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(i)}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        <Plus className="mr-1 size-4" /> Ajouter
      </Button>
    </div>
  )
}
