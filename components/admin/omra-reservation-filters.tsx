"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { Search, Filter, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  packages: { id: string; name: string }[]
}

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "created_desc", label: "Date création (récent)" },
  { value: "created_asc", label: "Date création (ancien)" },
  { value: "departure_asc", label: "Départ (proche)" },
  { value: "departure_desc", label: "Départ (lointain)" },
  { value: "amount_desc", label: "Montant (élevé)" },
  { value: "amount_asc", label: "Montant (faible)" },
  { value: "ref_asc", label: "Référence (A→Z)" },
]

export function OmraReservationFilters({ packages }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [packageId, setPackageId] = useState(
    searchParams.get("packageId") ?? "all",
  )
  const [departureFrom, setDepartureFrom] = useState(
    searchParams.get("departureFrom") ?? "",
  )
  const [departureTo, setDepartureTo] = useState(
    searchParams.get("departureTo") ?? "",
  )
  const [createdFrom, setCreatedFrom] = useState(
    searchParams.get("createdFrom") ?? "",
  )
  const [createdTo, setCreatedTo] = useState(searchParams.get("createdTo") ?? "")
  const [sort, setSort] = useState(searchParams.get("sort") ?? "created_desc")

  function apply() {
    const params = new URLSearchParams()
    const status = searchParams.get("status")
    if (status) params.set("status", status)
    if (search.trim()) params.set("search", search.trim())
    if (packageId && packageId !== "all") params.set("packageId", packageId)
    if (departureFrom) params.set("departureFrom", departureFrom)
    if (departureTo) params.set("departureTo", departureTo)
    if (createdFrom) params.set("createdFrom", createdFrom)
    if (createdTo) params.set("createdTo", createdTo)
    if (sort && sort !== "created_desc") params.set("sort", sort)
    router.push(`/admin/omra/reservations?${params.toString()}`)
  }

  function reset() {
    const params = new URLSearchParams()
    const status = searchParams.get("status")
    if (status) params.set("status", status)
    setSearch("")
    setPackageId("all")
    setDepartureFrom("")
    setDepartureTo("")
    setCreatedFrom("")
    setCreatedTo("")
    setSort("created_desc")
    router.push(`/admin/omra/reservations?${params.toString()}`)
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        apply()
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="omra-res-search">Recherche</Label>
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="omra-res-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Référence, client, téléphone, email, programme…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="w-full space-y-1.5 sm:w-56">
          <Label>Programme</Label>
          <Select value={packageId} onValueChange={setPackageId}>
            <SelectTrigger>
              <SelectValue placeholder="Tous les programmes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les programmes</SelectItem>
              {packages.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1.5 sm:w-56">
          <Label>Tri</Label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="omra-dep-from">Départ (du)</Label>
          <Input
            id="omra-dep-from"
            type="date"
            value={departureFrom}
            onChange={(e) => setDepartureFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="omra-dep-to">Départ (au)</Label>
          <Input
            id="omra-dep-to"
            type="date"
            value={departureTo}
            onChange={(e) => setDepartureTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="omra-cre-from">Réservation (du)</Label>
          <Input
            id="omra-cre-from"
            type="date"
            value={createdFrom}
            onChange={(e) => setCreatedFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="omra-cre-to">Réservation (au)</Label>
          <Input
            id="omra-cre-to"
            type="date"
            value={createdTo}
            onChange={(e) => setCreatedTo(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit">
          <Filter className="mr-2 h-4 w-4" />
          Appliquer
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Réinitialiser
        </Button>
      </div>
    </form>
  )
}
