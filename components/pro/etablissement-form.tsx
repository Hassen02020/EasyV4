"use client"

import { useState } from "react"
import {
  Building2,
  Mail,
  Phone,
  Printer,
  MapPin,
  Hash,
  FileBadge,
  Globe2,
  Coins,
  EyeOff,
  Save,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type EtablissementInitial = {
  name: string
  contactEmail: string
  contactPhone: string
  fax: string
  matriculeFiscale: string
  registreCommerce: string
  address: string
  logoUrl: string
  defaultLanguage: string
  defaultCurrency: string
  maskCredit: boolean
}

/** Format Tunisien attendu : XXXXXXXX/X/X/XXX */
const MATRICULE_REGEX = /^\d{7}[A-Z]\/[A-Z]\/[A-Z]\/\d{3}$/

interface EtablissementFormProps {
  initial: EtablissementInitial
}

export function EtablissementForm({ initial }: EtablissementFormProps) {
  const [state, setState] = useState<EtablissementInitial>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof EtablissementInitial, string>>>({})

  function update<K extends keyof EtablissementInitial>(
    key: K,
    value: EtablissementInitial[K],
  ) {
    setState((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      if (!(key in prev)) return prev
      const out = { ...prev }
      delete out[key]
      return out
    })
  }

  function validate(): boolean {
    const next: typeof errors = {}
    if (!state.name.trim()) next.name = "Nom commercial requis"
    if (!state.contactEmail.trim() || !/.+@.+\..+/.test(state.contactEmail))
      next.contactEmail = "Email invalide"
    if (
      state.matriculeFiscale &&
      !MATRICULE_REGEX.test(state.matriculeFiscale.trim())
    )
      next.matriculeFiscale = "Format attendu : 1399210Z/A/M/002"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    // Mock — sera un Server Action lié à agencies en phase 9
    setTimeout(() => {
      setSubmitting(false)
      toast.success("Établissement enregistré (mock — phase 9 : Server Action)")
    }, 700)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border-border/60 shadow-e2b-soft space-y-5 rounded-2xl border p-5 md:p-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          icon={Building2}
          label="Nom commercial *"
          value={state.name}
          onChange={(v) => update("name", v)}
          error={errors.name}
          required
        />
        <Field
          icon={Mail}
          type="email"
          label="Email *"
          value={state.contactEmail}
          onChange={(v) => update("contactEmail", v)}
          error={errors.contactEmail}
          required
        />
        <Field
          icon={Phone}
          label="Téléphone"
          value={state.contactPhone}
          onChange={(v) => update("contactPhone", v)}
          placeholder="+216 71 000 000"
        />
        <Field
          icon={Printer}
          label="Fax"
          value={state.fax}
          onChange={(v) => update("fax", v)}
        />
        <Field
          icon={Hash}
          label="Matricule Fiscale"
          value={state.matriculeFiscale}
          onChange={(v) => update("matriculeFiscale", v.toUpperCase())}
          placeholder="1399210Z/A/M/002"
          error={errors.matriculeFiscale}
          hint="Format Tunisien attendu : 7 chiffres + lettre / lettre / lettre / 3 chiffres"
        />
        <Field
          icon={FileBadge}
          label="Registre de commerce"
          value={state.registreCommerce}
          onChange={(v) => update("registreCommerce", v)}
        />
        <div className="md:col-span-2">
          <Field
            icon={MapPin}
            label="Adresse"
            value={state.address}
            onChange={(v) => update("address", v)}
            placeholder="Rue, code postal, ville"
          />
        </div>
        <Field
          icon={Building2}
          label="Logo (URL)"
          value={state.logoUrl}
          onChange={(v) => update("logoUrl", v)}
          placeholder="https://…"
        />
        <div>
          <Label className="text-xs">Langue par défaut</Label>
          <Select
            value={state.defaultLanguage}
            onValueChange={(v) => update("defaultLanguage", v)}
          >
            <SelectTrigger className="mt-1">
              <Globe2 className="text-muted-foreground mr-1 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">Français (FR)</SelectItem>
              <SelectItem value="ar">العربية (AR)</SelectItem>
              <SelectItem value="en">English (EN)</SelectItem>
              <SelectItem value="tr">Türkçe (TR)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Devise par défaut</Label>
          <Select
            value={state.defaultCurrency}
            onValueChange={(v) => update("defaultCurrency", v)}
          >
            <SelectTrigger className="mt-1">
              <Coins className="text-muted-foreground mr-1 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TND">Dinar tunisien (DT)</SelectItem>
              <SelectItem value="EUR">Euro (€)</SelectItem>
              <SelectItem value="USD">Dollar US ($)</SelectItem>
              <SelectItem value="DZD">Dinar algérien (DA)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className="border-border/50 hover:bg-muted/30 flex cursor-pointer items-start gap-3 rounded-xl border p-3">
        <Checkbox
          checked={state.maskCredit}
          onCheckedChange={(c) => update("maskCredit", c === true)}
          className="mt-0.5"
        />
        <span className="flex-1">
          <span className="text-foreground inline-flex items-center gap-1.5 text-sm font-semibold">
            <EyeOff className="text-muted-foreground h-3.5 w-3.5" />
            Masquer mon crédit dans le header
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs">
            Le widget «&nbsp;Mon Crédit&nbsp;» reste fonctionnel mais le
            montant n&apos;est plus affiché à votre équipe (utile pour les
            agents en open space).
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting} className="rounded-xl">
          {submitting ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Enregistrement…
            </>
          ) : (
            <>
              <Save className="mr-1.5 h-4 w-4" />
              Enregistrer
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  error,
  hint,
}: {
  icon: typeof Building2
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  error?: string
  hint?: string
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="relative mt-1">
        <Icon className="text-muted-foreground absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className="pl-9"
          aria-invalid={Boolean(error)}
        />
      </div>
      {error ? (
        <p className="text-destructive mt-1 text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      ) : null}
    </div>
  )
}
