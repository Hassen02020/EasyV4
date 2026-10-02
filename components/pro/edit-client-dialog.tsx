"use client"

/**
 * R3-01 (audit Phase 0) : édition d'une fiche client existante — même
 * principe que NewClientDialog, appelle updatePartnerClient qui revérifie
 * tout côté serveur (permission "clients.edit" + scoping agence).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { updatePartnerClient } from "@/lib/pro/client-actions"
import type { PartnerClient } from "@/lib/pro/mock-tables"

export function EditClientDialog({ client }: { client: PartnerClient }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState(client.firstName ?? "")
  const [lastName, setLastName] = useState(client.lastName ?? "")
  const [email, setEmail] = useState(client.email ?? "")
  const [phone, setPhone] = useState(client.phone ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await updatePartnerClient({
        customerId: client.id,
        firstName,
        lastName,
        email,
        phone,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`Client ${firstName} ${lastName} mis à jour.`)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Modifier ${client.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifier {client.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-client-firstname">Prénom</Label>
              <Input
                id="edit-client-firstname"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-client-lastname">Nom</Label>
              <Input
                id="edit-client-lastname"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-client-email">Email</Label>
            <Input
              id="edit-client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-client-phone">Téléphone</Label>
            <Input
              id="edit-client-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isPending}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={isPending} className="gap-2">
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
