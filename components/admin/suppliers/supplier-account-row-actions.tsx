"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  MoreHorizontal,
  PlugZap,
  Ban,
  CheckCircle2,
  KeyRound,
  Users,
  Loader2,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  setSupplierAccountStatus,
  rotateSupplierCredentials,
  testSupplierConnection,
  authorizeAgencyForAccount,
  revokeAgencyAuthorization,
  updateSupplierAccount,
} from "@/lib/hotel-suppliers/tenant/accounts"

interface AgencyOption {
  id: string
  name: string
}

interface AuthorizedAgency {
  id: string
  agencyId: string
  agencyName: string
}

export function SupplierAccountRowActions({
  accountId,
  displayName,
  status,
  ownerType,
  agencies,
  authorizedAgencies,
  priority,
  timeoutMs,
  isDefault,
}: {
  accountId: string
  displayName: string
  status: string
  ownerType: string
  agencies: AgencyOption[]
  authorizedAgencies: AuthorizedAgency[]
  priority: number
  timeoutMs: number | null
  isDefault: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rotateOpen, setRotateOpen] = useState(false)
  const [authorizeOpen, setAuthorizeOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [pickedAgencyId, setPickedAgencyId] = useState(agencies[0]?.id ?? "")
  const [editDisplayName, setEditDisplayName] = useState(displayName)
  const [editPriority, setEditPriority] = useState(String(priority))
  const [editTimeoutMs, setEditTimeoutMs] = useState(timeoutMs != null ? String(timeoutMs) : "")
  const [editIsDefault, setEditIsDefault] = useState(isDefault)

  const isActive = status === "active"

  function handleTest() {
    startTransition(async () => {
      const result = await testSupplierConnection(accountId)
      if (!result.ok) {
        toast.error(`Test échoué : ${result.error}`)
        return
      }
      toast.success("Connexion vérifiée avec succès.")
      router.refresh()
    })
  }

  function handleToggleStatus() {
    startTransition(async () => {
      const result = await setSupplierAccountStatus(accountId, isActive ? "disabled" : "active")
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(isActive ? `${displayName} désactivé.` : `${displayName} activé.`)
      router.refresh()
    })
  }

  function handleRotate() {
    startTransition(async () => {
      const result = await rotateSupplierCredentials(accountId, login, password)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Identifiants mis à jour.")
      setRotateOpen(false)
      setLogin("")
      setPassword("")
      router.refresh()
    })
  }

  function handleAuthorize() {
    startTransition(async () => {
      const result = await authorizeAgencyForAccount(accountId, pickedAgencyId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Agence autorisée.")
      router.refresh()
    })
  }

  function handleEdit() {
    const trimmedName = editDisplayName.trim()
    if (!trimmedName) {
      toast.error("Le nom est requis.")
      return
    }
    const parsedPriority = Number(editPriority)
    if (!Number.isFinite(parsedPriority) || parsedPriority < 0) {
      toast.error("Priorité invalide.")
      return
    }
    const parsedTimeoutMs = editTimeoutMs.trim() === "" ? null : Number(editTimeoutMs)
    if (parsedTimeoutMs != null && (!Number.isFinite(parsedTimeoutMs) || parsedTimeoutMs <= 0)) {
      toast.error("Timeout invalide.")
      return
    }
    startTransition(async () => {
      const result = await updateSupplierAccount({
        accountId,
        displayName: trimmedName,
        priority: parsedPriority,
        timeoutMs: parsedTimeoutMs,
        isDefault: editIsDefault,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Compte fournisseur mis à jour.")
      setEditOpen(false)
      router.refresh()
    })
  }

  function handleRevoke(authorizedAgencyId: string) {
    startTransition(async () => {
      const result = await revokeAgencyAuthorization(accountId, authorizedAgencyId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Autorisation révoquée.")
      router.refresh()
    })
  }

  const availableToAuthorize = agencies.filter((a) => !authorizedAgencies.some((x) => x.agencyId === a.id))

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions pour ${displayName}`} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTest() }}>
            <PlugZap className="mr-2 h-4 w-4" />
            Tester la connexion
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setEditOpen(true) }}>
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setRotateOpen(true) }}>
            <KeyRound className="mr-2 h-4 w-4" />
            Changer les identifiants
          </DropdownMenuItem>
          {ownerType === "master" && (
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setAuthorizeOpen(true) }}>
              <Users className="mr-2 h-4 w-4" />
              Autoriser une agence
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className={isActive ? "text-destructive" : "text-success"}
            onSelect={(e) => { e.preventDefault(); handleToggleStatus() }}
          >
            {isActive ? <Ban className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {isActive ? "Désactiver" : "Activer"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier — {displayName}</DialogTitle>
            <DialogDescription>
              Nom, priorité de sélection (agence/type/priorité — voir Best Rate Engine), délai fournisseur et compte par
              défaut.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nom</Label>
              <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Priorité (plus bas = préféré)</Label>
              <Input
                type="number"
                min={0}
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Timeout (ms, vide = défaut système)</Label>
              <Input
                type="number"
                min={1}
                value={editTimeoutMs}
                onChange={(e) => setEditTimeoutMs(e.target.value)}
                placeholder="Ex. 8000"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`is-default-${accountId}`}
                checked={editIsDefault}
                onCheckedChange={(checked) => setEditIsDefault(checked === true)}
              />
              <Label htmlFor={`is-default-${accountId}`} className="font-normal">
                Compte par défaut pour cette agence/ce fournisseur
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleEdit} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer les identifiants — {displayName}</DialogTitle>
            <DialogDescription>
              Remplace le login/mot de passe chiffré de ce compte. L&apos;ancien secret n&apos;est jamais affiché ni récupérable.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Nouveau login</Label>
              <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
            </div>
            <div className="grid gap-2">
              <Label>Nouveau mot de passe</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleRotate} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={authorizeOpen} onOpenChange={setAuthorizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autoriser une agence — {displayName}</DialogTitle>
            <DialogDescription>
              Seules les agences explicitement autorisées ici peuvent utiliser ce compte partagé — jamais un accès implicite.
            </DialogDescription>
          </DialogHeader>

          {authorizedAgencies.length > 0 && (
            <div className="space-y-2">
              <Label>Agences actuellement autorisées</Label>
              <ul className="space-y-1">
                {authorizedAgencies.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm">
                    {a.agencyName}
                    <Button variant="ghost" size="sm" disabled={isPending} onClick={() => handleRevoke(a.agencyId)}>
                      Révoquer
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {availableToAuthorize.length > 0 ? (
            <div className="grid gap-2">
              <Label>Ajouter une agence</Label>
              <Select value={pickedAgencyId} onValueChange={setPickedAgencyId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableToAuthorize.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Toutes les agences sont déjà autorisées.</p>
          )}

          <DialogFooter>
            <Button onClick={handleAuthorize} disabled={isPending || availableToAuthorize.length === 0}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Autoriser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
