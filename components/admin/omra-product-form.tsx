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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { createOmraProduct, updateOmraProduct } from "@/lib/admin/omra-product-actions"
import { omraProductSchema, omraProductMetadataSchema, type OmraProductInput } from "@/lib/admin/schemas/omra-product"
import { PRODUCT_CHANNELS } from "@/lib/admin/product-constants"

const CHANNEL_LABEL: Record<string, string> = { b2c: "B2C (grand public)", b2b: "B2B (agences)", white_label: "Marque blanche" }
const TYPE_LABEL: Record<string, string> = { omra: "Omra Régulière", hajj: "Hajj", ramadan: "Omra Ramadan", umrah_plus: "Omra + Ziarat" }

const INCLUDE_FLAGS: { key: keyof OmraProductInput; label: string }[] = [
  { key: "includesVisa", label: "Visa" },
  { key: "includesFlights", label: "Vols" },
  { key: "includesHotels", label: "Hôtels" },
  { key: "includesTransfers", label: "Transferts" },
  { key: "includesZiarat", label: "Ziarat" },
  { key: "includesGuide", label: "Guide spirituel" },
]

export function OmraProductForm({
  productId,
  initial,
}: {
  productId?: string
  initial?: Partial<OmraProductInput>
}) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<OmraProductInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(omraProductSchema) as any,
    defaultValues: {
      type: initial?.type ?? "omra",
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      durationDays: initial?.durationDays ?? 10,
      validFrom: initial?.validFrom ?? "",
      validUntil: initial?.validUntil ?? "",
      basePrice: initial?.basePrice ?? 0,
      includesVisa: initial?.includesVisa ?? true,
      includesFlights: initial?.includesFlights ?? true,
      includesHotels: initial?.includesHotels ?? true,
      includesTransfers: initial?.includesTransfers ?? true,
      includesZiarat: initial?.includesZiarat ?? true,
      includesGuide: initial?.includesGuide ?? false,
      maxPilgrims: initial?.maxPilgrims ?? 45,
      minPilgrims: initial?.minPilgrims ?? 20,
      metadata: initial?.metadata ?? omraProductMetadataSchema.parse({}),
      channels: initial?.channels ?? ["b2c"],
    },
  })

  const channels = useWatch({ control: form.control, name: "channels" })
  const firstDestination = useWatch({ control: form.control, name: "metadata.firstDestination" })
  const watchedType = useWatch({ control: form.control, name: "type" })
  const includeFlags = useWatch({
    control: form.control,
    name: INCLUDE_FLAGS.map((f) => f.key) as (typeof INCLUDE_FLAGS)[number]["key"][],
  })

  function toggleChannel(channel: string, checked: boolean) {
    const next = checked ? [...channels, channel] : channels.filter((c) => c !== channel)
    form.setValue("channels", next as OmraProductInput["channels"])
  }

  async function onSubmit(data: OmraProductInput) {
    setIsSubmitting(true)
    const result = productId ? await updateOmraProduct(productId, data) : await createOmraProduct(data)
    setIsSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(productId ? "Programme mis à jour." : "Programme créé en brouillon.")
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
              <Label>Type de programme *</Label>
              <Select value={watchedType} onValueChange={(v) => form.setValue("type", v as OmraProductInput["type"])}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nom du programme *</Label>
              <Input {...form.register("name")} placeholder="Omra Ramadan 2026" className="mt-1" />
              {form.formState.errors.name ? <p className="text-destructive mt-1 text-xs">{form.formState.errors.name.message}</p> : null}
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea {...form.register("description")} className="mt-1" rows={4} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Durée (jours) *</Label>
              <Input type="number" min={1} {...form.register("durationDays", { valueAsNumber: true })} className="mt-1" />
            </div>
            <div>
              <Label>Valide du *</Label>
              <Input type="date" {...form.register("validFrom")} className="mt-1" />
            </div>
            <div>
              <Label>Valide au *</Label>
              <Input type="date" {...form.register("validUntil")} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Vol</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Compagnie</Label>
            <Input {...form.register("metadata.flight.airline")} placeholder="Tunisair" className="mt-1" />
          </div>
          <div>
            <Label>Aéroport départ (IATA)</Label>
            <Input {...form.register("metadata.flight.departureAirport")} placeholder="TUN" maxLength={4} className="mt-1" />
          </div>
          <div>
            <Label>Aéroport arrivée (IATA)</Label>
            <Input {...form.register("metadata.flight.arrivalAirport")} placeholder="JED" maxLength={4} className="mt-1" />
          </div>
          <div>
            <Label>Vol aller</Label>
            <Input {...form.register("metadata.flight.outboundFlightNumber")} className="mt-1" />
          </div>
          <div>
            <Label>Vol retour</Label>
            <Input {...form.register("metadata.flight.returnFlightNumber")} className="mt-1" />
          </div>
          <div>
            <Label>Bagages</Label>
            <Input {...form.register("metadata.flight.baggageAllowance")} placeholder="23kg + cabine" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Itinéraire — La Mecque / Médine</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Première destination</Label>
            <Select value={firstDestination} onValueChange={(v) => form.setValue("metadata.firstDestination", v as "makkah" | "madinah")}>
              <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="makkah">La Mecque</SelectItem>
                <SelectItem value="madinah">Médine</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-semibold">La Mecque</p>
              <Input {...form.register("metadata.makkah.hotelName")} placeholder="Nom de l'hôtel" />
              <Input type="number" min={0} {...form.register("metadata.makkah.nights", { valueAsNumber: true })} placeholder="Nuits" />
              <Input {...form.register("metadata.makkah.mealPlan")} placeholder="Régime (demi-pension...)" />
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-sm font-semibold">Médine</p>
              <Input {...form.register("metadata.madinah.hotelName")} placeholder="Nom de l'hôtel" />
              <Input type="number" min={0} {...form.register("metadata.madinah.nights", { valueAsNumber: true })} placeholder="Nuits" />
              <Input {...form.register("metadata.madinah.mealPlan")} placeholder="Régime (demi-pension...)" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Accompagnateur</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Nom</Label>
            <Input {...form.register("metadata.accompanyingPerson.name")} className="mt-1" />
          </div>
          <div>
            <Label>Rôle</Label>
            <Input {...form.register("metadata.accompanyingPerson.role")} placeholder="Guide spirituel" className="mt-1" />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input {...form.register("metadata.accompanyingPerson.phone")} className="mt-1" />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input {...form.register("metadata.accompanyingPerson.whatsapp")} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Services & prix</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {INCLUDE_FLAGS.map(({ key, label }, index) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={key}
                  checked={Boolean(includeFlags[index])}
                  onCheckedChange={(v) => form.setValue(key, Boolean(v) as OmraProductInput[typeof key])}
                />
                <Label htmlFor={key}>{label}</Label>
              </div>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Prix de base (DT/pèlerin) *</Label>
              <Input type="number" step="0.001" {...form.register("basePrice", { valueAsNumber: true })} className="mt-1" />
            </div>
            <div>
              <Label>Min pèlerins</Label>
              <Input type="number" min={1} {...form.register("minPilgrims", { valueAsNumber: true })} className="mt-1" />
            </div>
            <div>
              <Label>Max pèlerins</Label>
              <Input type="number" min={1} {...form.register("maxPilgrims", { valueAsNumber: true })} className="mt-1" />
            </div>
          </div>
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
