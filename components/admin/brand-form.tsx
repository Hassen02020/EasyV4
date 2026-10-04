"use client"

import { useState } from "react"
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe2,
  Save,
  Loader2,
  Link2,
} from "lucide-react"
import { toast } from "sonner"
import { updateOtaBrand } from "@/lib/admin/brand-actions"
import type { BrandInitial } from "@/lib/admin/brand-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/

interface BrandFormProps {
  initial: BrandInitial
}

export function BrandForm({ initial }: BrandFormProps) {
  const [state, setState] = useState<BrandInitial>(initial)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<
    Partial<Record<keyof BrandInitial, string>>
  >({})

  function update<K extends keyof BrandInitial>(
    key: K,
    value: BrandInitial[K],
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
    if (!state.brandName.trim()) next.brandName = "Nom de marque requis"
    if (state.contactEmail && !/.+@.+\..+/.test(state.contactEmail))
      next.contactEmail = "Email invalide"
    if (state.primaryColor && !HEX_COLOR_REGEX.test(state.primaryColor.trim()))
      next.primaryColor = "Format attendu : #RRGGBB"
    const URL_RE = /^https?:\/\/.+/
    if (state.facebookUrl && !URL_RE.test(state.facebookUrl.trim()))
      next.facebookUrl = "URL invalide (doit commencer par https://)"
    if (state.instagramUrl && !URL_RE.test(state.instagramUrl.trim()))
      next.instagramUrl = "URL invalide (doit commencer par https://)"
    if (state.tiktokUrl && !URL_RE.test(state.tiktokUrl.trim()))
      next.tiktokUrl = "URL invalide (doit commencer par https://)"
    setErrors(next)
    return Object.keys(next).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || submitting) return
    setSubmitting(true)
    updateOtaBrand(state)
      .then((result) => {
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success("Identité de marque mise à jour.")
      })
      .catch(() => toast.error("Erreur technique. Veuillez réessayer."))
      .finally(() => setSubmitting(false))
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border-border/60 space-y-5 rounded-2xl border p-5 md:p-6"
    >
      <section>
        <h2 className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
          Identité visuelle
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            icon={Building2}
            label="Nom de marque *"
            value={state.brandName}
            onChange={(v) => update("brandName", v)}
            error={errors.brandName}
            required
          />
          <Field
            icon={Globe2}
            label="Logo (URL)"
            value={state.logoUrl}
            onChange={(v) => update("logoUrl", v)}
            placeholder="https://…"
          />
          <div>
            <Label className="text-xs">Couleur d&apos;accent</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={
                  HEX_COLOR_REGEX.test(state.primaryColor)
                    ? state.primaryColor
                    : "#c2410c"
                }
                onChange={(e) => update("primaryColor", e.target.value)}
                className="border-border h-9 w-11 shrink-0 rounded-md border p-0.5"
                aria-label="Sélectionner la couleur d'accent"
              />
              <Input
                value={state.primaryColor}
                onChange={(e) => update("primaryColor", e.target.value)}
                placeholder="#c2410c"
                maxLength={7}
                aria-invalid={Boolean(errors.primaryColor)}
              />
            </div>
            {errors.primaryColor ? (
              <p className="text-destructive mt-1 text-xs">
                {errors.primaryColor}
              </p>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">
                Couleur principale des boutons et liens sur le storefront
                public.
              </p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
          Coordonnées
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            icon={Mail}
            type="email"
            label="Email de contact"
            value={state.contactEmail}
            onChange={(v) => update("contactEmail", v)}
            error={errors.contactEmail}
          />
          <Field
            icon={Phone}
            label="Téléphone"
            value={state.contactPhone}
            onChange={(v) => update("contactPhone", v)}
            placeholder="+216 71 000 000"
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
            icon={Phone}
            label="WhatsApp (numéro international)"
            value={state.whatsappNumber}
            onChange={(v) => update("whatsappNumber", v)}
            placeholder="21698140514"
            hint="Format international sans +, ex. 21698140514"
          />
        </div>
      </section>

      <section>
        <h2 className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
          Réseaux sociaux
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            icon={Link2}
            label="Facebook (URL)"
            value={state.facebookUrl}
            onChange={(v) => update("facebookUrl", v)}
            placeholder="https://www.facebook.com/…"
            error={errors.facebookUrl}
          />
          <Field
            icon={Link2}
            label="Instagram (URL)"
            value={state.instagramUrl}
            onChange={(v) => update("instagramUrl", v)}
            placeholder="https://www.instagram.com/…"
            error={errors.instagramUrl}
          />
          <Field
            icon={Link2}
            label="TikTok (URL)"
            value={state.tiktokUrl}
            onChange={(v) => update("tiktokUrl", v)}
            placeholder="https://tiktok.com/@…"
            error={errors.tiktokUrl}
          />
        </div>
      </section>

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
        <Icon className="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
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
