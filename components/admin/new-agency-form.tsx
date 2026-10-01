"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Building } from "lucide-react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { UserPlus } from "lucide-react"
import { createAgency, createPartnerOwner } from "@/lib/admin/agencies-actions"

/**
 * R2-05 (audit Phase 0) : createAgency ne crée que la ligne `agencies` —
 * pour une agence "partner", cette étape 2 (facultative, "Passer" possible)
 * invite immédiatement son premier partner_owner via createPartnerOwner
 * (lib/admin/agencies-actions.ts), pour ne pas laisser une agence sans
 * aucun utilisateur capable de s'y connecter.
 */
function InviteOwnerStep({ agencyId, agencyName }: { agencyId: string; agencyName: string }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createPartnerOwner({ agencyId, email, name })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`Invitation envoyée à ${email}.`)
      router.push("/admin/agencies")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Agence <strong>{agencyName}</strong> créée. Invitez son premier propriétaire (partner_owner) pour qu&apos;elle
        soit utilisable, ou passez cette étape pour l&apos;inviter plus tard.
      </p>
      <div className="space-y-2">
        <Label htmlFor="owner-name">Nom complet</Label>
        <Input id="owner-name" value={name} onChange={(e) => setName(e.target.value)} required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="owner-email">Email</Label>
        <Input
          id="owner-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isPending}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Envoyer l&apos;invitation
        </Button>
        <Button type="button" variant="ghost" disabled={isPending} onClick={() => router.push("/admin/agencies")}>
          Passer, inviter plus tard
        </Button>
      </div>
    </form>
  )
}

export function NewAgencyForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [agencyType, setAgencyType] = useState<"ota" | "partner">("partner")
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [created, setCreated] = useState<{ agencyId: string; name: string } | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createAgency({ name, agencyType, contactEmail, contactPhone })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`Agence "${name}" créée.`)
      if (agencyType === "partner") {
        setCreated({ agencyId: result.agencyId, name })
        return
      }
      router.push("/admin/agencies")
    })
  }

  if (created) {
    return <InviteOwnerStep agencyId={created.agencyId} agencyName={created.name} />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="agency-name">Nom de l&apos;agence</Label>
        <Input
          id="agency-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agency-type">Type</Label>
        <Select value={agencyType} onValueChange={(v) => setAgencyType(v as "ota" | "partner")}>
          <SelectTrigger id="agency-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="partner">Partenaire B2B</SelectItem>
            <SelectItem value="ota">OTA (Easy2Book)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          « Partenaire B2B » couvre l&apos;immense majorité des cas — accès /pro, wallet, recharge.
          « OTA » est réservé aux entités Easy2Book elles-mêmes (accès /admin).
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="agency-email">Email de contact</Label>
        <Input
          id="agency-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          disabled={isPending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agency-phone">Téléphone</Label>
        <Input
          id="agency-phone"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          disabled={isPending}
        />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={isPending} className="gap-2">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building className="h-4 w-4" />}
        Créer l&apos;agence
      </Button>
    </form>
  )
}
