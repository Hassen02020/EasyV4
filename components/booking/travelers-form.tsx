"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  travelerSchemaWithIdRule,
  type TravelerInput,
} from "@/lib/booking/schemas"
import { decodeDraft, encodeDraft } from "@/lib/booking/draft-store"
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
import { ArrowRight } from "lucide-react"

type FieldErrors = Partial<Record<keyof TravelerInput, string>>

export function TravelersForm({
  token,
  initial,
}: {
  token: string
  initial?: TravelerInput
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [form, setForm] = useState<TravelerInput>({
    civility: initial?.civility ?? "M",
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    civicIdType: initial?.civicIdType ?? "cin",
    civicId: initial?.civicId ?? "",
    birthDate: initial?.birthDate ?? "",
    nationality: initial?.nationality ?? "",
  })

  function update<K extends keyof TravelerInput>(
    key: K,
    value: TravelerInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) {
      setErrors((e) => ({ ...e, [key]: undefined }))
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = travelerSchemaWithIdRule.safeParse(form)
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.errors) {
        const k = issue.path[0] as keyof TravelerInput
        if (!next[k]) next[k] = issue.message
      }
      setErrors(next)
      return
    }
    const payload = decodeDraft(token)
    if (!payload) {
      router.push("/")
      return
    }
    const newToken = encodeDraft({
      draft: payload.draft,
      traveler: parsed.data,
    })
    startTransition(() => {
      router.push(`/booking/checkout?d=${encodeURIComponent(newToken)}`)
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="bg-card border-border space-y-6 rounded-xl border p-6 shadow-sm"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="civility">Civilité</Label>
          <Select
            value={form.civility}
            onValueChange={(v) =>
              update("civility", v as TravelerInput["civility"])
            }
          >
            <SelectTrigger id="civility" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">M.</SelectItem>
              <SelectItem value="Mme">Mme</SelectItem>
              <SelectItem value="Mlle">Mlle</SelectItem>
            </SelectContent>
          </Select>
          <FieldError msg={errors.civility} />
        </div>
        <div className="sm:col-span-1">
          <Label htmlFor="firstName">Prénom *</Label>
          <Input
            id="firstName"
            value={form.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            placeholder="Hassen"
            className="mt-1"
            required
          />
          <FieldError msg={errors.firstName} />
        </div>
        <div>
          <Label htmlFor="lastName">Nom *</Label>
          <Input
            id="lastName"
            value={form.lastName}
            onChange={(e) => update("lastName", e.target.value)}
            placeholder="Tarhouni"
            className="mt-1"
            required
          />
          <FieldError msg={errors.lastName} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="vous@email.tn"
            className="mt-1"
            required
          />
          <FieldError msg={errors.email} />
        </div>
        <div>
          <Label htmlFor="phone">Téléphone *</Label>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+216 98 140 514"
            className="mt-1"
            required
          />
          <FieldError msg={errors.phone} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="civicIdType">Pièce d&apos;identité</Label>
          <Select
            value={form.civicIdType}
            onValueChange={(v) =>
              update("civicIdType", v as TravelerInput["civicIdType"])
            }
          >
            <SelectTrigger id="civicIdType" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cin">CIN tunisienne</SelectItem>
              <SelectItem value="passport">Passeport</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="civicId">
            Numéro{" "}
            {form.civicIdType === "cin" ? "CIN (8 chiffres)" : "passeport"} *
          </Label>
          <Input
            id="civicId"
            value={form.civicId}
            onChange={(e) => update("civicId", e.target.value)}
            placeholder={form.civicIdType === "cin" ? "12345678" : "AB1234567"}
            className="mt-1"
            required
          />
          <FieldError msg={errors.civicId} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="birthDate">Date de naissance</Label>
          <Input
            id="birthDate"
            type="date"
            value={form.birthDate}
            onChange={(e) => update("birthDate", e.target.value)}
            className="mt-1"
          />
          <FieldError msg={errors.birthDate} />
        </div>
        <div>
          <Label htmlFor="nationality">Nationalité</Label>
          <Input
            id="nationality"
            value={form.nationality}
            onChange={(e) => update("nationality", e.target.value)}
            placeholder="Tunisienne"
            className="mt-1"
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Validation…" : "Continuer vers le paiement"}
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </form>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-destructive mt-1 text-xs">{msg}</p>
}
