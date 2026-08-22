"use client"

/**
 * AuthorizedProductsList — /pro/produits (Phase 13.1, gap #2).
 *
 * Réservation compacte pour Voyages Organisés et Attractions (contact
 * simple + participants, `createPackageBooking`/`createActivityBooking`
 * B2B). Omra reste listé (preuve que l'autorisation/RLS fonctionne pour
 * les 3 types) mais son formulaire pèlerin complet (identité, passeport,
 * contact d'urgence — `OmraPilgrimInput`) n'est pas dupliqué ici en
 * version simplifiée : plutôt que de fabriquer des données pèlerin
 * factices pour remplir un formulaire compact, la ligne Omra renvoie vers
 * `/pro/sandbox`, seul endroit qui collecte aujourd'hui une fiche pèlerin
 * complète. Documenté comme gap dans le rapport Phase 13.1, pas masqué.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, ChevronDown, ChevronUp } from "lucide-react"
import type { AuthorizedProductRow } from "@/lib/b2b/authorized-products"
import { getBookableOptionsForProduct, type BookableOption } from "@/lib/b2b/product-booking-options-actions"
import { createPackageBooking } from "@/lib/packages/booking-actions"
import { createActivityBooking } from "@/lib/activities/booking-actions"

const TYPE_LABEL: Record<AuthorizedProductRow["productType"], string> = {
  package: "Voyage Organisé",
  omra: "Omra",
  activity: "Attraction",
}

interface AuthorizedProductsListProps {
  products: AuthorizedProductRow[]
}

export function AuthorizedProductsList({ products }: AuthorizedProductsListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {products.map((p) => (
        <Card key={p.authorizationId}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{p.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{TYPE_LABEL[p.productType]}</Badge>
                  <Badge variant="secondary" className="text-xs">
                    {p.channel === "b2b" ? "B2B" : "White Label"}
                  </Badge>
                </div>
              </div>
              {p.productType === "omra" ? (
                <Button variant="outline" size="sm" asChild>
                  <a href="/pro/sandbox">Réserver via /pro/sandbox</a>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExpandedId(expandedId === p.authorizationId ? null : p.authorizationId)}
                >
                  {expandedId === p.authorizationId ? (
                    <>
                      Fermer <ChevronUp className="ml-1 h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      Réserver <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              )}
            </div>
            {expandedId === p.authorizationId && p.productType !== "omra" ? (
              <div className="mt-4 border-t pt-4">
                <BookingInlineForm product={p} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function BookingInlineForm({ product }: { product: AuthorizedProductRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [options, setOptions] = useState<BookableOption[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [optionId, setOptionId] = useState<string>("")
  const [adults, setAdults] = useState(1)
  const [children, setChildren] = useState(0)
  const [childrenAges, setChildrenAges] = useState<number[]>([])
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (options === null && !isPending && !loadError) {
    startTransition(async () => {
      const result = await getBookableOptionsForProduct(product.productType as "package" | "activity", product.productId)
      if (!result.ok) {
        setLoadError(result.error)
        return
      }
      setOptions(result.options)
      setOptionId(result.options[0]?.id ?? "")
    })
  }

  function setChildrenCount(n: number) {
    setChildren(n)
    setChildrenAges((prev) => {
      const next = [...prev]
      if (n > next.length) while (next.length < n) next.push(0)
      else next.length = n
      return next
    })
  }

  function handleSubmit() {
    setSubmitError(null)
    if (!optionId) {
      setSubmitError("Choisissez une date.")
      return
    }
    if (!firstName || !lastName || !phone) {
      setSubmitError("Nom, prénom et téléphone client requis.")
      return
    }
    startTransition(async () => {
      const result =
        product.productType === "package"
          ? await createPackageBooking({
              packageId: product.productId,
              departureId: optionId,
              adults,
              children,
              childrenAges,
              customerFirstName: firstName,
              customerLastName: lastName,
              customerPhone: phone,
              customerEmail: email,
            })
          : await createActivityBooking({
              activityId: product.productId,
              sessionId: optionId,
              adults,
              children,
              childrenAges,
              customerFirstName: firstName,
              customerLastName: lastName,
              customerPhone: phone,
              customerEmail: email,
            })
      if (!result.ok) {
        setSubmitError(result.error)
        return
      }
      setSuccess(result.publicRef)
    })
  }

  if (success) {
    return (
      <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
        Réservation confirmée — référence <span className="font-semibold">{success}</span>.{" "}
        <button className="underline" onClick={() => router.refresh()}>
          Actualiser
        </button>
      </div>
    )
  }

  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>
  }

  if (options === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des disponibilités…
      </div>
    )
  }

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune date disponible pour ce produit actuellement.</p>
  }

  return (
    <div className="space-y-4">
      {submitError ? <p className="text-destructive text-sm">{submitError}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Date</Label>
          <Select value={optionId} onValueChange={setOptionId}>
            <SelectTrigger className="mt-1 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {new Date(o.date).toLocaleDateString("fr-FR")}
                  {o.kind === "session" ? ` · ${o.start}–${o.end}` : ""} —{" "}
                  {o.kind === "departure" ? o.seatsLeft : o.capacityLeft} places
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Adultes</Label>
            <Input type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))} className="mt-1 h-9" />
          </div>
          <div>
            <Label className="text-xs">Enfants</Label>
            <Input type="number" min={0} value={children} onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value) || 0))} className="mt-1 h-9" />
          </div>
        </div>
      </div>
      {children > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: children }).map((_, i) => (
            <div key={i}>
              <Label className="text-xs">Âge enfant {i + 1}</Label>
              <Input
                type="number"
                min={0}
                max={17}
                value={childrenAges[i] ?? 0}
                onChange={(e) => {
                  const next = [...childrenAges]
                  next[i] = Math.max(0, Number(e.target.value) || 0)
                  setChildrenAges(next)
                }}
                className="mt-1 h-9"
              />
            </div>
          ))}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Prénom client *</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 h-9" />
        </div>
        <div>
          <Label className="text-xs">Nom client *</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 h-9" />
        </div>
        <div>
          <Label className="text-xs">Téléphone *</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-9" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9" />
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={isPending} size="sm">
        {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Confirmer la réservation (débit compte de dépôt)
      </Button>
    </div>
  )
}
