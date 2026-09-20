"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, MapPin, Car, Tag } from "lucide-react"
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
  createCarLocation,
  setCarLocationStatus,
  createCarCategory,
  setCarCategoryStatus,
  createCarPricingRate,
  setCarPricingRateActive,
  type CarPricingRateRow,
} from "@/lib/admin/car-catalog-actions"
import type { CarLocation, CarCategory } from "@/lib/db/schema"

const LOCATION_TYPES = [
  { value: "airport", label: "Aéroport" },
  { value: "city", label: "Ville" },
  { value: "hotel", label: "Hôtel" },
  { value: "train_station", label: "Gare" },
]

const TRANSMISSION_TYPES = [
  { value: "manual", label: "Manuelle" },
  { value: "automatic", label: "Automatique" },
]

const FUEL_TYPES = [
  { value: "petrol", label: "Essence" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybride" },
  { value: "electric", label: "Électrique" },
]

/* -------------------------------------------------------------------------- */
/* Lieux                                                                       */
/* -------------------------------------------------------------------------- */

function LocationForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [city, setCity] = useState("")
  const [locationType, setLocationType] = useState("city")
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!name.trim() || !city.trim()) {
      toast.error("Nom et ville requis")
      return
    }
    startTransition(async () => {
      const res = await createCarLocation({ name, city, locationType: locationType as "airport" | "city" | "hotel" | "train_station" })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Lieu créé")
      setName("")
      setCity("")
      setOpen(false)
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nouveau lieu
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau lieu de prise en charge</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cl-name">Nom</Label>
            <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aéroport Tunis-Carthage" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-city">Ville</Label>
            <Input id="cl-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Tunis" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={locationType} onValueChange={setLocationType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
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

function LocationsTab({ locations, onDone }: { locations: CarLocation[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()

  function toggle(id: string, current: string) {
    startTransition(async () => {
      const res = await setCarLocationStatus(id, current === "active" ? "inactive" : "active")
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
          <CardTitle className="text-base">Lieux de prise en charge / retour</CardTitle>
          <CardDescription>Comptoirs où un client peut récupérer ou rendre un véhicule.</CardDescription>
        </div>
        <LocationForm onDone={onDone} />
      </CardHeader>
      <CardContent>
        {locations.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">Aucun lieu créé pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell className="text-sm">{l.city}</TableCell>
                  <TableCell className="text-sm">{LOCATION_TYPES.find((t) => t.value === l.locationType)?.label ?? l.locationType}</TableCell>
                  <TableCell>
                    <Badge className={l.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""} variant={l.status === "active" ? "default" : "outline"}>
                      {l.status === "active" ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => toggle(l.id, l.status)}>
                      {l.status === "active" ? "Désactiver" : "Activer"}
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

/* -------------------------------------------------------------------------- */
/* Catégories                                                                  */
/* -------------------------------------------------------------------------- */

function CategoryForm({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [seats, setSeats] = useState("5")
  const [transmission, setTransmission] = useState("manual")
  const [fuelType, setFuelType] = useState("petrol")
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!code.trim() || !name.trim()) {
      toast.error("Code et nom requis")
      return
    }
    startTransition(async () => {
      const res = await createCarCategory({
        code: code.toUpperCase(),
        name,
        seats: parseInt(seats, 10) || 5,
        transmission: transmission as "manual" | "automatic",
        fuelType: fuelType as "petrol" | "diesel" | "hybrid" | "electric",
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Catégorie créée")
      setCode("")
      setName("")
      setOpen(false)
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nouvelle catégorie
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle catégorie de véhicule</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cc-code">Code</Label>
            <Input id="cc-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ECO" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-name">Nom</Label>
            <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Économique" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-seats">Places</Label>
            <Input id="cc-seats" type="number" min="1" max="60" value={seats} onChange={(e) => setSeats(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Transmission</Label>
            <Select value={transmission} onValueChange={setTransmission}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSMISSION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Carburant</Label>
            <Select value={fuelType} onValueChange={setFuelType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUEL_TYPES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
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

function CategoriesTab({ categories, onDone }: { categories: CarCategory[]; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()

  function toggle(id: string, current: string) {
    startTransition(async () => {
      const res = await setCarCategoryStatus(id, current === "active" ? "inactive" : "active")
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
          <CardTitle className="text-base">Catégories de véhicules</CardTitle>
          <CardDescription>Économique, SUV, Luxe… chacune avec ses caractéristiques.</CardDescription>
        </div>
        <CategoryForm onDone={onDone} />
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">Aucune catégorie créée pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Places</TableHead>
                <TableHead>Transmission</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">{c.code}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm">{c.seats}</TableCell>
                  <TableCell className="text-sm">{TRANSMISSION_TYPES.find((t) => t.value === c.transmission)?.label ?? c.transmission}</TableCell>
                  <TableCell>
                    <Badge className={c.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""} variant={c.status === "active" ? "default" : "outline"}>
                      {c.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => toggle(c.id, c.status)}>
                      {c.status === "active" ? "Désactiver" : "Activer"}
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

/* -------------------------------------------------------------------------- */
/* Tarifs                                                                      */
/* -------------------------------------------------------------------------- */

function PricingForm({ categories, locations, onDone }: { categories: CarCategory[]; locations: CarLocation[]; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [categoryId, setCategoryId] = useState("")
  const [locationId, setLocationId] = useState("__all__")
  const [dailyRateTnd, setDailyRateTnd] = useState("")
  const [depositTnd, setDepositTnd] = useState("0")
  const [isPending, startTransition] = useTransition()

  const activeCategories = categories.filter((c) => c.status === "active")
  const activeLocations = locations.filter((l) => l.status === "active")

  function submit() {
    if (!categoryId) {
      toast.error("Sélectionnez une catégorie")
      return
    }
    startTransition(async () => {
      const res = await createCarPricingRate({
        categoryId,
        locationId: locationId === "__all__" ? undefined : locationId,
        dailyRateTnd: parseFloat(dailyRateTnd) || 0,
        depositTnd: parseFloat(depositTnd) || 0,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success("Tarif créé")
      setCategoryId("")
      setDailyRateTnd("")
      setOpen(false)
      onDone()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={activeCategories.length === 0}>
          <Plus className="h-4 w-4" />
          Nouveau tarif
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau tarif</DialogTitle>
          <DialogDescription>Tarif journalier pour une catégorie, éventuellement limité à un lieu.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Catégorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Lieu (optionnel — vide = tous les lieux)</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous les lieux</SelectItem>
                {activeLocations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-daily">Tarif journalier (DT)</Label>
            <Input id="cp-daily" type="number" min="0" step="0.001" value={dailyRateTnd} onChange={(e) => setDailyRateTnd(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-deposit">Franchise/dépôt (DT)</Label>
            <Input id="cp-deposit" type="number" min="0" step="0.001" value={depositTnd} onChange={(e) => setDepositTnd(e.target.value)} />
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

function PricingTab({
  categories,
  locations,
  rates,
  onDone,
}: {
  categories: CarCategory[]
  locations: CarLocation[]
  rates: CarPricingRateRow[]
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function toggle(id: string, current: boolean) {
    startTransition(async () => {
      const res = await setCarPricingRateActive(id, !current)
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
          <CardDescription>Tarif journalier par catégorie, éventuellement par lieu.</CardDescription>
        </div>
        <PricingForm categories={categories} locations={locations} onDone={onDone} />
      </CardHeader>
      <CardContent>
        {categories.filter((c) => c.status === "active").length === 0 && (
          <p className="text-muted-foreground mb-4 text-sm">Créez au moins une catégorie active avant d&apos;ajouter un tarif.</p>
        )}
        {rates.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">Aucun tarif configuré pour le moment.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Catégorie</TableHead>
                <TableHead>Lieu</TableHead>
                <TableHead>Tarif/jour</TableHead>
                <TableHead>Dépôt</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.categoryName}</TableCell>
                  <TableCell className="text-sm">{r.locationName ?? "Tous les lieux"}</TableCell>
                  <TableCell className="tabular-nums">{r.dailyRateTnd.toFixed(3)} DT</TableCell>
                  <TableCell className="tabular-nums">{r.depositTnd.toFixed(3)} DT</TableCell>
                  <TableCell>
                    <Badge className={r.isActive ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""} variant={r.isActive ? "default" : "outline"}>
                      {r.isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={isPending} onClick={() => toggle(r.id, r.isActive)}>
                      {r.isActive ? "Désactiver" : "Activer"}
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

export function CarCatalogManager({
  initialLocations,
  initialCategories,
  initialRates,
}: {
  initialLocations: CarLocation[]
  initialCategories: CarCategory[]
  initialRates: CarPricingRateRow[]
}) {
  const router = useRouter()
  // Pas de useState local : router.refresh() repasse des props fraîches
  // depuis le Server Component parent (voir transfer-catalog-manager.tsx).
  const locations = initialLocations
  const categories = initialCategories
  const rates = initialRates

  function refresh() {
    router.refresh()
  }

  return (
    <Tabs defaultValue="locations" className="space-y-4">
      <TabsList>
        <TabsTrigger value="locations" className="gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          Lieux ({locations.length})
        </TabsTrigger>
        <TabsTrigger value="categories" className="gap-1.5">
          <Car className="h-3.5 w-3.5" />
          Catégories ({categories.length})
        </TabsTrigger>
        <TabsTrigger value="pricing" className="gap-1.5">
          <Tag className="h-3.5 w-3.5" />
          Tarifs ({rates.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="locations">
        <LocationsTab locations={locations} onDone={refresh} />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesTab categories={categories} onDone={refresh} />
      </TabsContent>
      <TabsContent value="pricing">
        <PricingTab categories={categories} locations={locations} rates={rates} onDone={refresh} />
      </TabsContent>
    </Tabs>
  )
}
