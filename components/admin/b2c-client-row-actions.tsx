"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Eye, Edit, FileText, MoreHorizontal, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateCustomer } from "@/lib/admin/b2c-clients-actions"

interface Client {
  id: string
  civility: "M" | "Mme" | "Mlle" | null
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  civicId: string | null
  city: string | null
  country: string | null
}

/**
 * Menu d'actions pour une ligne de app/admin/b2c/clients — les 3 actions
 * étaient jusqu'ici toutes `disabled` ("Pas encore disponible"). Même
 * pattern composant client dédié que b2c-reservation-row-actions.tsx
 * (hydratation) + même pattern Dialog contrôlé hors du DropdownMenu que
 * components/admin/suppliers/supplier-account-row-actions.tsx (un
 * DropdownMenuItem qui ouvre un Dialog doit appeler `e.preventDefault()`
 * dans `onSelect`, sinon Radix ferme le menu et vole le focus du Dialog).
 */
export function B2cClientRowActions({ client }: { client: Client }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [civility, setCivility] = useState<"M" | "Mme" | "Mlle" | "">(client.civility ?? "")
  const [firstName, setFirstName] = useState(client.firstName)
  const [lastName, setLastName] = useState(client.lastName)
  const [email, setEmail] = useState(client.email ?? "")
  const [phone, setPhone] = useState(client.phone ?? "")
  const [civicId, setCivicId] = useState(client.civicId ?? "")
  const [city, setCity] = useState(client.city ?? "")
  const [error, setError] = useState<string | null>(null)

  const displayName = `${client.firstName} ${client.lastName}`

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateCustomer({
        customerId: client.id,
        civility,
        firstName,
        lastName,
        email,
        phone,
        civicId,
        city,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Client mis à jour.")
      setEditOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions pour ${displayName}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/admin/b2c/clients/${client.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              Voir profil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setError(null)
              setEditOpen(true)
            }}
          >
            <Edit className="mr-2 h-4 w-4" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/b2c/reservations?customerId=${client.id}`}>
              <FileText className="mr-2 h-4 w-4" />
              Voir réservations
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier — {displayName}</DialogTitle>
            <DialogDescription>Coordonnées et identité du client, dans votre agence.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor={`edit-civility-${client.id}`}>Civilité</Label>
                <Select value={civility} onValueChange={(v) => setCivility(v as typeof civility)}>
                  <SelectTrigger id={`edit-civility-${client.id}`}>
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
                <Label htmlFor={`edit-firstname-${client.id}`}>Prénom</Label>
                <Input
                  id={`edit-firstname-${client.id}`}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`edit-lastname-${client.id}`}>Nom</Label>
              <Input
                id={`edit-lastname-${client.id}`}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`edit-email-${client.id}`}>Email</Label>
              <Input
                id={`edit-email-${client.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor={`edit-phone-${client.id}`}>Téléphone</Label>
                <Input
                  id={`edit-phone-${client.id}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`edit-civicid-${client.id}`}>CIN / Passeport</Label>
                <Input
                  id={`edit-civicid-${client.id}`}
                  value={civicId}
                  onChange={(e) => setCivicId(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`edit-city-${client.id}`}>Ville</Label>
              <Input
                id={`edit-city-${client.id}`}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={isPending}
              />
            </div>
            {error && <p className="text-destructive text-sm font-medium">{error}</p>}
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={isPending || !firstName.trim() || !lastName.trim()}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
