"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, MapPin, Route } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createTransferZone,
  setTransferZoneStatus,
  createTransferPricing,
  deleteTransferPricing,
  type TransferPricingRow,
} from "@/lib/admin/transfers-catalog-actions"
import type { CatalogTransferZone } from "@/lib/db/schema"

const ZONE_TYPES = [
  { value: "airport", label: "Aéroport" },
  { value: "hotel", label: "Hôtel" },
  { value: "city", label: "Ville" },
  { value: "station", label: "Gare" },
]

const VEHICLE_TYPES = [
  { value: "sedan", label: "Berline" },
  { value: "van", label: "Van" },
  { value: "minibus", label: "Minibus" },
  { value: "bus", label: "Bus" },
  { value: "luxury", label: "Luxe" },
]

function ZoneForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [zoneType, setZoneType] = useState("airport")
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!name.trim()) {
      toast.error("Nom requis")
      return
    }
    startTransition(async () => {
      const res = await createTransferZone({ name, zoneType: zoneType as "airport" | "hotel" | "city" | "station" })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Zone créée")
      setName("")
      setZoneType("airport")
      setOpen(false)
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nouvelle zone
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle zone de transfert</DialogTitle>
          <DialogDescription>Aéroport, hôtel, ville ou gare — point de départ/arrivée possible.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="zone-name">Nom</Label>
            <Input id="zone-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aéroport Tunis-Carthage" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={zoneType} onValueChange={setZoneType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ZONE_TYPES.map((z) => (
                  <SelectItem key={z.value} value={z.value}>
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ZonesTab({ zones, onDone }: { zones: CatalogTransferZone[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()

  function toggle(zoneId: string, current: string) {
    startTransition(async () => {
      const res = await setTransferZoneStatus(zoneId, current === "active" ? "inactive" : "active")
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onDone()
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Zones</CardTitle>
          <CardDescription>Points de départ/arrivée disponibles pour vos transferts.</CardDescription>
        </div>
        <ZoneForm onDone={onDone} />
      </CardHeader>
      <CardContent>
        {zones.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">Aucune zone créée pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {zones.map((z) => (
                <TableRow key={z.id}>
                  <TableCell className="font-medium">{z.name}</TableCell>
                  <TableCell className="text-sm capitalize">{ZONE_TYPES.find((t) => t.value === z.zoneType)?.label ?? z.zoneType}</TableCell>
                  <TableCell>
                    <Badge className={z.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""} variant={z.status === "active" ? "default" : "outline"}>
                      {z.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => toggle(z.id, z.status)}>
                      {z.status === "active" ? "Désactiver" : "Activer"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function PricingForm({ zones, onDone }: { zones: CatalogTransferZone[]; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [fromZoneId, setFromZoneId] = useState("")
  const [toZoneId, setToZoneId] = useState("")
  const [vehicleType, setVehicleType] = useState("sedan")
  const [basePriceTnd, setBasePriceTnd] = useState("")
  const [nightSurchargePercent, setNightSurchargePercent] = useState("0")
  const [isPending, startTransition] = useTransition()

  const activeZones = zones.filter((z) => z.status === "active")

  function submit() {
    if (!fromZoneId || !toZoneId) {
      toast.error("Sélectionnez les deux zones")
      return
    }
    startTransition(async () => {
      const res = await createTransferPricing({
        fromZoneId,
        toZoneId,
        vehicleType,
        basePriceTnd: parseFloat(basePriceTnd) || 0,
        nightSurchargePercent: parseFloat(nightSurchargePercent) || 0,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Tarif créé")
      setFromZoneId("")
      setToZoneId("")
      setBasePriceTnd("")
      setNightSurchargePercent("0")
      setOpen(false)
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={activeZones.length < 2}>
          <Plus className="h-4 w-4" />
          Nouveau tarif
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau tarif de transfert</DialogTitle>
          <DialogDescription>Prix pour un trajet + type de véhicule donné.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Zone de départ</Label>
            <Select value={fromZoneId} onValueChange={setFromZoneId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {activeZones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Zone d&apos;arrivée</Label>
            <Select value={toZoneId} onValueChange={setToZoneId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {activeZones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Véhicule</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tp-price">Prix de base (DT)</Label>
            <Input id="tp-price" type="number" min="0" step="0.001" value={basePriceTnd} onChange={(e) => setBasePriceTnd(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tp-night">Majoration nuit (%) — 21h-6h</Label>
            <Input id="tp-night" type="number" min="0" max="200" value={nightSurchargePercent} onChange={(e) => setNightSurchargePercent(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={isPending} className="gap-1.5">
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PricingTab({ zones, pricing, onDone }: { zones: CatalogTransferZone[]; pricing: TransferPricingRow[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteTransferPricing(id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      onDone()
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Tarifs</CardTitle>
          <CardDescription>Un tarif par trajet (zone → zone) et type de véhicule.</CardDescription>
        </div>
        <PricingForm zones={zones} onDone={onDone} />
      </CardHeader>
      <CardContent>
        {zones.filter((z) => z.status === "active").length < 2 && (
          <p className="text-muted-foreground mb-4 text-sm">Créez au moins deux zones actives avant d&apos;ajouter un tarif.</p>
        )}
        {pricing.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">Aucun tarif configuré pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trajet</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead>Prix de base</TableHead>
                <TableHead>Majoration nuit</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricing.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm">
                    {p.fromZoneName} → {p.toZoneName}
                  </TableCell>
                  <TableCell className="text-sm">{VEHICLE_TYPES.find((v) => v.value === p.vehicleType)?.label ?? p.vehicleType}</TableCell>
                  <TableCell className="tabular-nums">{p.basePriceTnd.toFixed(3)} DT</TableCell>
                  <TableCell className="tabular-nums">{p.nightSurchargePercent}%</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-600" disabled={isPending} onClick={() => remove(p.id)}>
                      Supprimer
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function TransferCatalogManager({
  initialZones,
  initialPricing,
}: {
  initialZones: CatalogTransferZone[]
  initialPricing: TransferPricingRow[]
}) {
  const router = useRouter()
  // Pas de useState local ici : router.refresh() re-rend le Server Component
  // parent (app/(internal)/admin/transferts/page.tsx) et repasse des props
  // fraîches — un useState(initial...) figerait la première valeur reçue.
  const zones = initialZones
  const pricing = initialPricing

  function refresh() {
    router.refresh()
  }

  return (
    <Tabs defaultValue="zones" className="space-y-4">
      <TabsList>
        <TabsTrigger value="zones" className="gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Zones ({zones.length})
        </TabsTrigger>
        <TabsTrigger value="pricing" className="gap-1.5">
          <Route className="h-3.5 w-3.5" />
          Tarifs ({pricing.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="zones">
        <ZonesTab zones={zones} onDone={refresh} />
      </TabsContent>
      <TabsContent value="pricing">
        <PricingTab zones={zones} pricing={pricing} onDone={refresh} />
      </TabsContent>
    </Tabs>
  )
}
