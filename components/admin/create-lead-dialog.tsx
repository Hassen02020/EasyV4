"use client"

/**
 * CRM-STAFF-LEAD-01 — bouton "Nouveau lead" + dialog de saisie manuelle
 * pour le staff, dans /admin/support.
 */

import { useState, useTransition } from "react"
import { PlusCircle } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { createLead } from "@/lib/admin/leads-actions"
import type { CrmChannel } from "@/lib/crm/inbox-core"

const CHANNEL_LABELS: Record<CrmChannel, string> = {
  call: "Appel téléphonique",
  email: "Email",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  web: "Site web",
}

export function CreateLeadDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [channel, setChannel] = useState<CrmChannel>("call")
  const [notes, setNotes] = useState("")

  function reset() {
    setFirstName("")
    setLastName("")
    setEmail("")
    setPhone("")
    setChannel("call")
    setNotes("")
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) {
      toast.error("Le prénom est requis.")
      return
    }
    startTransition(async () => {
      const result = await createLead({
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        channel,
        notes: notes.trim() || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Lead créé avec succès.")
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <PlusCircle className="h-4 w-4" />
          Nouveau lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Saisir un lead manuellement</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-firstName">
                Prénom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cl-firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Prénom"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-lastName">Nom</Label>
              <Input
                id="cl-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nom"
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-channel">Canal de contact</Label>
            <Select
              value={channel}
              onValueChange={(v) => setChannel(v as CrmChannel)}
              disabled={isPending}
            >
              <SelectTrigger id="cl-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(CHANNEL_LABELS) as [CrmChannel, string][]).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-phone">Téléphone</Label>
            <Input
              id="cl-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+216 XX XXX XXX"
              type="tel"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-email">Email</Label>
            <Input
              id="cl-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@exemple.com"
              type="email"
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cl-notes">Notes</Label>
            <Textarea
              id="cl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Détails de la demande…"
              rows={3}
              disabled={isPending}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending || !firstName.trim()}>
              {isPending ? "Enregistrement…" : "Créer le lead"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
