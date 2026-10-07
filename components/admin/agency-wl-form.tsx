"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { updateAgencyWhiteLabel } from "@/lib/admin/agencies-actions"

interface AgencyWLFormProps {
  agencyId: string
  initial: {
    brandName: string
    logoUrl: string
    primaryColor: string
    domain: string
  }
}

export function AgencyWhiteLabelForm({ agencyId, initial }: AgencyWLFormProps) {
  const [brandName, setBrandName] = useState(initial.brandName)
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl)
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor)
  const [domain, setDomain] = useState(initial.domain)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await updateAgencyWhiteLabel({
        agencyId,
        brandName: brandName || null,
        logoUrl: logoUrl || null,
        primaryColor: primaryColor || null,
        domain: domain || null,
      })
      if (res.ok) {
        toast.success("Configuration White Label enregistrée.")
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="wl-domain">Domaine dédié</Label>
        <p className="text-muted-foreground text-xs">
          Ex.{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            voyages.exemple.tn
          </code>{" "}
          — sans protocole ni chemin. Vide = pas de portail White Label.
        </p>
        <Input
          id="wl-domain"
          type="text"
          placeholder="voyages.exemple.tn"
          value={domain}
          onChange={(e) => setDomain(e.target.value.trim().toLowerCase())}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wl-brand-name">Nom de marque</Label>
        <p className="text-muted-foreground text-xs">
          Affiché dans l&apos;en-tête public et dans le portail{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">/pro</code> à
          la place du nom de l&apos;agence. Vide = nom de l&apos;agence par
          défaut.
        </p>
        <Input
          id="wl-brand-name"
          type="text"
          placeholder="Voyages Excellence"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          maxLength={200}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wl-logo-url">URL du logo</Label>
        <p className="text-muted-foreground text-xs">
          URL publique HTTPS vers l&apos;image du logo (PNG/SVG recommandé, fond
          transparent). Vide = logo Easy2Book par défaut.
        </p>
        <Input
          id="wl-logo-url"
          type="url"
          placeholder="https://cdn.exemple.tn/logo.svg"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value.trim())}
          maxLength={2048}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="wl-primary-color">Couleur d&apos;accent</Label>
        <p className="text-muted-foreground text-xs">
          Couleur hexadécimale{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">#RRGGBB</code>{" "}
          appliquée sur le bouton principal (variable CSS{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            --primary
          </code>
          ). Vide = teinte Easy2Book par défaut.
        </p>
        <div className="flex items-center gap-3">
          <Input
            id="wl-primary-color"
            type="text"
            placeholder="#1e3a5f"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value.trim())}
            maxLength={7}
            className="w-36 font-mono"
          />
          <input
            type="color"
            aria-label="Sélecteur de couleur"
            value={
              primaryColor.match(/^#[0-9a-fA-F]{6}$/) ? primaryColor : "#1e3a5f"
            }
            onChange={(e) => setPrimaryColor(e.target.value)}
            className="h-9 w-9 cursor-pointer rounded border p-0.5"
          />
          {primaryColor.match(/^#[0-9a-fA-F]{6}$/) && (
            <span
              className="h-6 w-6 rounded-full border"
              style={{ backgroundColor: primaryColor }}
              aria-hidden
            />
          )}
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  )
}
