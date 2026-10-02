"use client"

/**
 * JOURNEY-BUILDER-01 — composeur B2B (/pro/journeys/[id], réutilisé tel
 * quel par /admin/journeys/[id]/composants — "même moteur, pas de deuxième
 * Journey Builder").
 *
 * Sélection produit V1 : identifiants collés (packageId/activityId/
 * productId/etc.), pas encore un picker catalogue live par module — gap UX
 * disclosed, pas un gap fonctionnel (le booking réel reste entièrement
 * rigoureux, chaque moteur revalide tout à la confirmation). Vol et Hôtels
 * Monde volontairement absents du sélecteur de module — voir la doc de
 * tête de lib/journeys/journey-actions.ts pour pourquoi (async staff-
 * fulfillment / guest-only, hors périmètre V1).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2,
  Plus,
  Trash2,
  RotateCw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Journey, JourneyLine } from "@/lib/db/schema"
import {
  addJourneyLine,
  removeJourneyLine,
  confirmJourneyLine,
  type AddJourneyLineResult,
} from "@/lib/journeys/journey-actions"
import {
  JOURNEY_WIRED_MODULES,
  type JourneyWiredModule,
} from "@/lib/journeys/journeys-core"

const MODULE_LABEL: Record<JourneyWiredModule, string> = {
  hotel: "Hôtel (Tunisie)",
  package: "Voyage Organisé",
  omra: "Omra",
  activity: "Attraction",
  transfer: "Transfert",
  car: "Location de voiture",
  network: "Produit Réseau",
}

/** Hôtel nécessite un brouillon (draft) issu de la recherche hôtel réelle —
 * pas un simple ID, hors périmètre du formulaire générique V1 ci-dessous. */
const SELECTABLE_MODULES = JOURNEY_WIRED_MODULES.filter((m) => m !== "hotel")

const STATUS_META: Record<
  JourneyLine["status"],
  {
    label: string
    variant: "outline" | "secondary" | "default" | "destructive"
    icon: typeof Clock
  }
> = {
  pending: { label: "En attente", variant: "outline", icon: Clock },
  processing: { label: "En cours...", variant: "secondary", icon: Loader2 },
  confirmed: { label: "Confirmée", variant: "default", icon: CheckCircle2 },
  failed: { label: "Échec", variant: "destructive", icon: XCircle },
}

const JOURNEY_STATUS_LABEL: Record<Journey["status"], string> = {
  draft: "Brouillon",
  ready: "Prête à confirmer",
  processing: "Confirmation en cours",
  confirmed: "Confirmée",
  partially_confirmed: "Partiellement confirmée",
  failed: "Échec",
}

interface Props {
  journey: Journey
  lines: JourneyLine[]
}

export function JourneyComposer({ journey, lines }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [module, setModule] = useState<JourneyWiredModule>("activity")
  const [fields, setFields] = useState<Record<string, string>>({})

  const composingLocked =
    journey.status !== "draft" && journey.status !== "ready"
  const totalTnd = lines.reduce(
    (sum, l) => sum + (l.priceTnd ? Number(l.priceTnd) : 0),
    0,
  )

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  function buildPayload(): {
    payload: Record<string, unknown>
    priceTnd?: number
  } | null {
    const customer = {
      customerFirstName: fields.customerFirstName ?? "",
      customerLastName: fields.customerLastName ?? "",
      customerPhone: fields.customerPhone ?? "",
      customerEmail: fields.customerEmail || undefined,
    }
    switch (module) {
      case "package":
        return {
          payload: {
            packageId: fields.packageId,
            departureId: fields.departureId,
            adults: Number(fields.adults ?? 1),
            children: Number(fields.children ?? 0),
            childrenAges: [],
            ...customer,
          },
        }
      case "activity":
        return {
          payload: {
            activityId: fields.activityId,
            sessionId: fields.sessionId,
            adults: Number(fields.adults ?? 1),
            children: Number(fields.children ?? 0),
            childrenAges: [],
            ...customer,
          },
        }
      case "network":
        return {
          payload: {
            productId: fields.productId,
            quantity: Number(fields.quantity ?? 1),
            ...customer,
          },
        }
      case "omra":
        return {
          payload: {
            packageId: fields.packageId,
            departureDate: fields.departureDate,
            pilgrims: [
              {
                firstName: fields.customerFirstName ?? "",
                lastName: fields.customerLastName ?? "",
                phone: fields.customerPhone ?? "",
                civility: "M",
                passportNumber: fields.passportNumber ?? "",
              },
            ],
          },
        }
      case "transfer":
        return {
          payload: {
            fromZoneId: fields.fromZoneId,
            toZoneId: fields.toZoneId,
            vehicleType: fields.vehicleType || "sedan",
            pickupDate: fields.pickupDate,
            pickupTime: fields.pickupTime,
            pax: Number(fields.pax ?? 1),
            customer: {
              firstName: fields.customerFirstName ?? "",
              lastName: fields.customerLastName ?? "",
              phone: fields.customerPhone ?? "",
              email: fields.customerEmail || undefined,
            },
          },
        }
      case "car":
        return {
          payload: {
            categoryId: fields.categoryId,
            pickupLocationId: fields.pickupLocationId,
            dropoffLocationId: fields.dropoffLocationId,
            pickupAt: fields.pickupAt,
            dropoffAt: fields.dropoffAt,
            insuranceLevel: fields.insuranceLevel || "basic",
            driver: {
              firstName: fields.customerFirstName ?? "",
              lastName: fields.customerLastName ?? "",
              phone: fields.customerPhone ?? "",
              licenseNumber: fields.licenseNumber ?? "",
            },
          },
        }
      default:
        return null
    }
  }

  function handleAddLine() {
    const built = buildPayload()
    if (!built) return
    startTransition(async () => {
      const result: AddJourneyLineResult = await addJourneyLine({
        journeyId: journey.id,
        module,
        payload: built.payload,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Ligne ajoutée.")
      setFields({})
      router.refresh()
    })
  }

  function handleRemove(lineId: string) {
    startTransition(async () => {
      const result = await removeJourneyLine({ lineId })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleConfirm(lineId: string) {
    startTransition(async () => {
      const result = await confirmJourneyLine({ lineId })
      if (!result.ok) {
        toast.error(result.error)
        router.refresh()
        return
      }
      toast.success(
        result.alreadyConfirmed ? "Déjà confirmée." : "Réservation confirmée.",
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">
            {journey.title ?? "Sans titre"}
          </p>
          <Badge variant="outline" className="mt-1">
            {JOURNEY_STATUS_LABEL[journey.status]}
          </Badge>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">
            Total commercial (snapshot)
          </p>
          <p className="text-lg font-semibold">{totalTnd.toFixed(2)} DT</p>
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line) => {
          const meta = STATUS_META[line.status]
          const Icon = meta.icon
          return (
            <Card key={line.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">
                    {MODULE_LABEL[line.module as JourneyWiredModule] ??
                      line.module}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant={meta.variant} className="gap-1">
                      <Icon
                        className={
                          line.status === "processing"
                            ? "h-3 w-3 animate-spin"
                            : "h-3 w-3"
                        }
                      />
                      {meta.label}
                    </Badge>
                    {line.priceTnd ? (
                      <span className="text-muted-foreground text-xs">
                        {Number(line.priceTnd).toFixed(2)} DT
                      </span>
                    ) : null}
                  </div>
                  {line.errorMessage ? (
                    <p className="text-destructive mt-1 text-xs">
                      {line.errorMessage}
                    </p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  {line.status === "pending" || line.status === "failed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => handleConfirm(line.id)}
                    >
                      {line.status === "failed" ? (
                        <>
                          <RotateCw className="mr-1 h-3.5 w-3.5" /> Retenter
                        </>
                      ) : (
                        "Confirmer"
                      )}
                    </Button>
                  ) : null}
                  {line.status === "pending" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => handleRemove(line.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )
        })}
        {lines.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucune ligne — ajoutez un produit ci-dessous.
          </p>
        ) : null}
      </div>

      {!composingLocked ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ajouter un produit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="journey-module-select" className="text-xs">
                Module
              </Label>
              <Select
                value={module}
                onValueChange={(v) => setModule(v as JourneyWiredModule)}
              >
                <SelectTrigger id="journey-module-select" className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODULE_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ModuleFields module={module} fields={fields} setField={setField} />

            <Button onClick={handleAddLine} disabled={isPending} size="sm">
              {isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Ajouter au Journey
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted-foreground text-sm">
          Composition verrouillée — une confirmation a déjà été tentée sur ce
          Journey. Les lignes en échec restent retentables individuellement
          ci-dessus.
        </p>
      )}
    </div>
  )
}

function TextField({
  label,
  k,
  fields,
  setField,
  type = "text",
}: {
  label: string
  k: string
  fields: Record<string, string>
  setField: (k: string, v: string) => void
  type?: string
}) {
  const id = `journey-field-${k}`
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        value={fields[k] ?? ""}
        onChange={(e) => setField(k, e.target.value)}
        className="mt-1 h-9"
      />
    </div>
  )
}

function CustomerFields({
  fields,
  setField,
}: {
  fields: Record<string, string>
  setField: (k: string, v: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        label="Prénom client"
        k="customerFirstName"
        fields={fields}
        setField={setField}
      />
      <TextField
        label="Nom client"
        k="customerLastName"
        fields={fields}
        setField={setField}
      />
      <TextField
        label="Téléphone"
        k="customerPhone"
        fields={fields}
        setField={setField}
      />
      <TextField
        label="Email"
        k="customerEmail"
        fields={fields}
        setField={setField}
      />
    </div>
  )
}

function ModuleFields({
  module,
  fields,
  setField,
}: {
  module: JourneyWiredModule
  fields: Record<string, string>
  setField: (k: string, v: string) => void
}) {
  switch (module) {
    case "package":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="ID Voyage Organisé"
              k="packageId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="ID Départ"
              k="departureId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="Adultes"
              k="adults"
              fields={fields}
              setField={setField}
              type="number"
            />
            <TextField
              label="Enfants"
              k="children"
              fields={fields}
              setField={setField}
              type="number"
            />
          </div>
          <CustomerFields fields={fields} setField={setField} />
        </div>
      )
    case "activity":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="ID Attraction"
              k="activityId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="ID Session"
              k="sessionId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="Adultes"
              k="adults"
              fields={fields}
              setField={setField}
              type="number"
            />
            <TextField
              label="Enfants"
              k="children"
              fields={fields}
              setField={setField}
              type="number"
            />
          </div>
          <CustomerFields fields={fields} setField={setField} />
        </div>
      )
    case "network":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="ID Produit Réseau"
              k="productId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="Quantité"
              k="quantity"
              fields={fields}
              setField={setField}
              type="number"
            />
          </div>
          <CustomerFields fields={fields} setField={setField} />
        </div>
      )
    case "omra":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="ID Programme Omra"
              k="packageId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="Date de départ"
              k="departureDate"
              fields={fields}
              setField={setField}
              type="date"
            />
            <TextField
              label="N° passeport pèlerin"
              k="passportNumber"
              fields={fields}
              setField={setField}
            />
          </div>
          <CustomerFields fields={fields} setField={setField} />
        </div>
      )
    case "transfer":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="ID Zone départ"
              k="fromZoneId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="ID Zone arrivée"
              k="toZoneId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="Type véhicule"
              k="vehicleType"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="Passagers"
              k="pax"
              fields={fields}
              setField={setField}
              type="number"
            />
            <TextField
              label="Date prise en charge"
              k="pickupDate"
              fields={fields}
              setField={setField}
              type="date"
            />
            <TextField
              label="Heure prise en charge"
              k="pickupTime"
              fields={fields}
              setField={setField}
              type="time"
            />
          </div>
          <CustomerFields fields={fields} setField={setField} />
        </div>
      )
    case "car":
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="ID Catégorie véhicule"
              k="categoryId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="Niveau assurance"
              k="insuranceLevel"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="ID Lieu de prise en charge"
              k="pickupLocationId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="ID Lieu de retour"
              k="dropoffLocationId"
              fields={fields}
              setField={setField}
            />
            <TextField
              label="Date/heure prise en charge"
              k="pickupAt"
              fields={fields}
              setField={setField}
              type="datetime-local"
            />
            <TextField
              label="Date/heure retour"
              k="dropoffAt"
              fields={fields}
              setField={setField}
              type="datetime-local"
            />
            <TextField
              label="N° permis conducteur"
              k="licenseNumber"
              fields={fields}
              setField={setField}
            />
          </div>
          <CustomerFields fields={fields} setField={setField} />
        </div>
      )
    default:
      return null
  }
}
