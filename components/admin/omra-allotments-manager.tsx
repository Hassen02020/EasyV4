"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CalendarDays, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  createOmraAllotment,
  deleteOmraAllotment,
} from "@/lib/omra/allotment-actions"
import type { OmraAllotment } from "@/lib/db/schema/omra"

interface Props {
  packageId: string
  basePrice: string
  maxCapacity: number
  initialAllotments: OmraAllotment[]
}

interface DraftForm {
  departureDate: string
  totalCapacity: string
  overridePrice: string
  bookingDeadline: string
}

function emptyForm(maxCapacity: number): DraftForm {
  return {
    departureDate: "",
    totalCapacity: String(maxCapacity),
    overridePrice: "",
    bookingDeadline: "",
  }
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function fmtPrice(v: string | null): string {
  if (v == null) return "—"
  return `${Number(v).toLocaleString("fr-FR")} TND`
}

export function OmraAllotmentsManager({
  packageId,
  basePrice,
  maxCapacity,
  initialAllotments,
}: Props) {
  const [allotments, setAllotments] =
    useState<OmraAllotment[]>(initialAllotments)
  const [form, setForm] = useState<DraftForm>(emptyForm(maxCapacity))
  const [isPending, startTransition] = useTransition()

  function update<K extends keyof DraftForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleAdd() {
    if (!form.departureDate) {
      toast.error("Veuillez choisir une date de départ.")
      return
    }
    startTransition(async () => {
      const result = await createOmraAllotment({
        packageId,
        departureDate: form.departureDate,
        totalCapacity: Number(form.totalCapacity),
        overridePrice: form.overridePrice ? Number(form.overridePrice) : null,
        bookingDeadline: form.bookingDeadline ? form.bookingDeadline : null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Date de départ ajoutée.")
      setAllotments((prev) =>
        [...prev, result.data].sort((a, b) =>
          a.departureDate.localeCompare(b.departureDate),
        ),
      )
      setForm(emptyForm(maxCapacity))
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteOmraAllotment(id, packageId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Date de départ supprimée.")
      setAllotments((prev) => prev.filter((a) => a.id !== id))
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-emerald-600" />
          Dates & prix (départs)
        </CardTitle>
        <CardDescription>
          Ajoutez les dates de départ, le nombre de places et un prix spécifique
          (sinon le prix de base {fmtPrice(basePrice)} s&apos;applique). Ces dates
          s&apos;affichent dans la section « Dates &amp; prix » de la fiche
          publique.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Formulaire d'ajout */}
        <div className="grid items-end gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="allot-date">Date de départ *</Label>
            <Input
              id="allot-date"
              type="date"
              value={form.departureDate}
              onChange={(e) => update("departureDate", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allot-capacity">Places</Label>
            <Input
              id="allot-capacity"
              type="number"
              min={1}
              value={form.totalCapacity}
              onChange={(e) => update("totalCapacity", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allot-price">Prix spécifique (TND)</Label>
            <Input
              id="allot-price"
              type="number"
              min={0}
              step="0.001"
              placeholder="Prix de base"
              value={form.overridePrice}
              onChange={(e) => update("overridePrice", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allot-deadline">Limite de résa.</Label>
            <Input
              id="allot-deadline"
              type="date"
              value={form.bookingDeadline}
              onChange={(e) => update("bookingDeadline", e.target.value)}
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={isPending}
            className="gap-2 bg-emerald-700 hover:bg-emerald-800"
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>

        {/* Liste */}
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Départ</TableHead>
                <TableHead className="text-right">Places dispo.</TableHead>
                <TableHead className="text-right">Capacité</TableHead>
                <TableHead className="text-right">Prix / pers</TableHead>
                <TableHead>Limite résa.</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {allotments.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    <CalendarDays className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    Aucune date de départ. Ajoutez-en une ci-dessus.
                  </TableCell>
                </TableRow>
              ) : (
                allotments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {fmtDate(a.departureDate)}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.availableCount > 0 ? (
                        <Badge className="bg-emerald-100 text-emerald-800">
                          {a.availableCount} places
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Complet</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {a.totalCapacity}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {fmtPrice(a.overridePrice ?? basePrice)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(a.bookingDeadline)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(a.id)}
                        disabled={isPending}
                        className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
