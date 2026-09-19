"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createCustomer } from "@/lib/admin/b2c-clients-actions"

export function NewClientDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [civility, setCivility] = useState<"M" | "Mme" | "Mlle" | "">("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [civicId, setCivicId] = useState("")
  const [city, setCity] = useState("")

  function reset() {
    setCivility("")
    setFirstName("")
    setLastName("")
    setEmail("")
    setPhone("")
    setCivicId("")
    setCity("")
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await createCustomer({ civility, firstName, lastName, email, phone, civicId, city })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`Client "${firstName} ${lastName}" créé.`)
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null) }}>
      <DialogTrigger asChild>
        <Button className="bg-sidebar">
          <Plus className="mr-2 h-4 w-4" />
          Nouveau client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau client</DialogTitle>
          <DialogDescription>
            Crée une fiche client dans votre agence (ex. client connu par téléphone, sans réservation encore).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="client-civility">Civilité</Label>
              <Select value={civility} onValueChange={(v) => setCivility(v as typeof civility)}>
                <SelectTrigger id="client-civility">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">M</SelectItem>
                  <SelectItem value="Mme">Mme</SelectItem>
                  <SelectItem value="Mlle">Mlle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 grid gap-2">
              <Label htmlFor="client-firstname">Prénom</Label>
              <Input id="client-firstname" value={firstName} onChange={(e) => setFirstName(e.target.value)} required disabled={isPending} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="client-lastname">Nom</Label>
            <Input id="client-lastname" value={lastName} onChange={(e) => setLastName(e.target.value)} required disabled={isPending} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="client-email">Email</Label>
            <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isPending} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="client-phone">Téléphone</Label>
              <Input id="client-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isPending} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-civicid">CIN / Passeport</Label>
              <Input id="client-civicid" value={civicId} onChange={(e) => setCivicId(e.target.value)} disabled={isPending} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="client-city">Ville</Label>
            <Input id="client-city" value={city} onChange={(e) => setCity(e.target.value)} disabled={isPending} />
          </div>
          {error && <p className="text-destructive text-sm font-medium">{error}</p>}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={isPending || !firstName.trim() || !lastName.trim()}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer le client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
