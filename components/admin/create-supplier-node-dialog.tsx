"use client"

/**
 * NETWORK-01 — création d'un nœud fournisseur réseau à partir d'un
 * fournisseur technique existant (aucune action de création de fournisseur
 * technique n'existe dans ce codebase — hors périmètre, gap pré-existant).
 * Même pattern que InviteAgentDialog : appel direct de la Server Action,
 * qui revérifie super_admin côté serveur.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { createSupplierNodeAction } from "@/lib/suppliers/portal-actions"
import type { SupplierRow } from "@/lib/suppliers/list-suppliers"

const MODULE_OPTIONS = ["hotel", "flight", "package", "transfer", "activity", "omra"]

export function CreateSupplierNodeDialog({
  availableSuppliers,
}: {
  availableSuppliers: SupplierRow[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState("")
  const [slug, setSlug] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [modules, setModules] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleModule(m: string) {
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
  }

  function reset() {
    setSupplierId("")
    setSlug("")
    setDisplayName("")
    setContactEmail("")
    setModules([])
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createSupplierNodeAction({
        supplierId,
        slug,
        displayName,
        contactEmail: contactEmail || undefined,
        modules,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`Nœud "${displayName}" créé.`)
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" disabled={availableSuppliers.length === 0}>
          <Plus className="h-4 w-4" />
          Créer un nœud
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un nœud fournisseur</DialogTitle>
          <DialogDescription>
            Rattache un fournisseur technique existant au réseau (identité, contact, modules
            couverts). Le portail reste désactivé jusqu&apos;à validation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node-supplier">Fournisseur technique</Label>
            <Select value={supplierId} onValueChange={setSupplierId} disabled={isPending}>
              <SelectTrigger id="node-supplier">
                <SelectValue placeholder="Sélectionner un fournisseur" />
              </SelectTrigger>
              <SelectContent>
                {availableSuppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="node-slug">Slug (URL)</Label>
            <Input
              id="node-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="artisan-poterie-nabeul"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="node-name">Nom commercial</Label>
            <Input
              id="node-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="node-email">Email de contact</Label>
            <Input
              id="node-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label>Modules couverts</Label>
            <div className="flex flex-wrap gap-2">
              {MODULE_OPTIONS.map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => toggleModule(m)}
                  disabled={isPending}
                  className={`rounded px-2 py-1 text-xs font-medium border ${
                    modules.includes(m)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending || !supplierId} className="gap-2">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Créer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
