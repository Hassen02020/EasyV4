"use client"

import * as React from "react"
import { type ColumnDef } from "@tanstack/react-table"
import { Building2, MoreHorizontal, PauseCircle, PlayCircle, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createMutuelleGroup,
  inviteMutuelleUser,
  setMutuelleGroupStatus,
  type MutuelleGroupRow,
} from "@/lib/admin/mutuelle-groups-actions"

interface AgencyOption {
  id: string
  name: string
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  active: { label: "Actif", variant: "default" },
  suspended: { label: "Suspendu", variant: "destructive" },
}

/* -------------------------------------------------------------------------- */
/* Dialog : nouveau groupe                                                     */
/* -------------------------------------------------------------------------- */

function CreateGroupDialog({
  agencyOptions,
  open,
  onClose,
}: {
  agencyOptions: AgencyOption[]
  open: boolean
  onClose: () => void
}) {
  const [name, setName] = React.useState("")
  const [slug, setSlug] = React.useState("")
  const [executionAgencyId, setExecutionAgencyId] = React.useState("")
  const [markupPercent, setMarkupPercent] = React.useState("0")
  const [conventionStartDate, setConventionStartDate] = React.useState("")
  const [conventionEndDate, setConventionEndDate] = React.useState("")
  const [contactEmail, setContactEmail] = React.useState("")
  const [contactPhone, setContactPhone] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  function resetAndClose() {
    setName("")
    setSlug("")
    setExecutionAgencyId("")
    setMarkupPercent("0")
    setConventionStartDate("")
    setConventionEndDate("")
    setContactEmail("")
    setContactPhone("")
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!executionAgencyId) {
      toast.error("Sélectionnez une agence d'exécution")
      return
    }
    setLoading(true)
    try {
      const res = await createMutuelleGroup({
        name,
        slug,
        executionAgencyId,
        markupPercent: parseFloat(markupPercent) || 0,
        conventionStartDate,
        conventionEndDate,
        contactEmail,
        contactPhone,
      })
      if (res.ok) {
        toast.success(`Groupe "${name}" créé`)
        resetAndClose()
      } else {
        toast.error(res.error)
      }
    } catch {
      toast.error("Erreur réseau — réessayez")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau groupe Mutuelle</DialogTitle>
          <DialogDescription>
            Identité et convention commerciale du distributeur privé.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mg-name">Nom *</Label>
              <Input id="mg-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mg-slug">Slug *</Label>
              <Input
                id="mg-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="mutuelle-exemple"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Agence d&apos;exécution *</Label>
            <Select value={executionAgencyId} onValueChange={setExecutionAgencyId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une agence" />
              </SelectTrigger>
              <SelectContent>
                {agencyOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="mg-markup">Markup (%)</Label>
              <Input
                id="mg-markup"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={markupPercent}
                onChange={(e) => setMarkupPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mg-start">Convention — début</Label>
              <Input
                id="mg-start"
                type="date"
                value={conventionStartDate}
                onChange={(e) => setConventionStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mg-end">Convention — fin</Label>
              <Input
                id="mg-end"
                type="date"
                value={conventionEndDate}
                onChange={(e) => setConventionEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mg-email">Email de contact</Label>
              <Input
                id="mg-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mg-phone">Téléphone</Label>
              <Input id="mg-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetAndClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Création…" : "Créer le groupe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Dialog : inviter directeur / membre                                         */
/* -------------------------------------------------------------------------- */

function InviteUserDialog({
  group,
  open,
  onClose,
}: {
  group: MutuelleGroupRow
  open: boolean
  onClose: () => void
}) {
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [role, setRole] = React.useState<"mutuelle_director" | "mutuelle_member">("mutuelle_member")
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await inviteMutuelleUser({ groupId: group.id, email, name, role })
      if (res.ok) {
        toast.success(`Invitation envoyée à ${email}`)
        setEmail("")
        setName("")
        setRole("mutuelle_member")
        onClose()
      } else {
        toast.error(res.error)
      }
    } catch {
      toast.error("Erreur réseau — réessayez")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Inviter un utilisateur
          </DialogTitle>
          <DialogDescription>
            Groupe : <span className="font-semibold">{group.name}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mu-email">Email</Label>
            <Input id="mu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mu-name">Nom</Label>
            <Input id="mu-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Rôle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mutuelle_director">Directeur (valide les demandes)</SelectItem>
                <SelectItem value="mutuelle_member">Membre (soumet des demandes)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------------- */
/* Colonnes                                                                     */
/* -------------------------------------------------------------------------- */

function buildColumns(
  onInvite: (group: MutuelleGroupRow) => void,
  onToggleStatus: (group: MutuelleGroupRow) => void,
): ColumnDef<MutuelleGroupRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Groupe",
      cell: ({ row }) => {
        const g = row.original
        return (
          <div>
            <p className="font-medium">{g.name}</p>
            <p className="text-muted-foreground text-xs">{g.slug}</p>
          </div>
        )
      },
    },
    {
      accessorKey: "executionAgencyName",
      header: "Agence d'exécution",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Building2 className="text-muted-foreground h-3.5 w-3.5" />
          {row.original.executionAgencyName}
        </span>
      ),
    },
    {
      accessorKey: "markupPercent",
      header: "Markup",
      cell: ({ row }) => <span className="tabular-nums">{row.original.markupPercent.toFixed(1)}%</span>,
    },
    {
      accessorKey: "memberCount",
      header: "Membres",
      cell: ({ row }) => <span className="tabular-nums">{row.original.memberCount}</span>,
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status] ?? { label: row.original.status, variant: "secondary" as const }
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>
      },
    },
    {
      id: "actions",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const group = row.original
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onInvite(group)}>
                  <UserPlus className="mr-2 h-4 w-4 text-blue-600" />
                  Inviter directeur/membre
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {group.status === "active" ? (
                  <DropdownMenuItem onClick={() => onToggleStatus(group)} className="text-red-600 focus:text-red-600">
                    <PauseCircle className="mr-2 h-4 w-4" />
                    Suspendre
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onToggleStatus(group)} className="text-green-600 focus:text-green-600">
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Activer
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}

/* -------------------------------------------------------------------------- */
/* Composant principal                                                          */
/* -------------------------------------------------------------------------- */

export function MutuelleGroupsDataTable({
  data,
  agencyOptions,
}: {
  data: MutuelleGroupRow[]
  agencyOptions: AgencyOption[]
}) {
  const [createOpen, setCreateOpen] = React.useState(false)
  const [inviteTarget, setInviteTarget] = React.useState<MutuelleGroupRow | null>(null)

  async function handleToggleStatus(group: MutuelleGroupRow) {
    const next = group.status === "active" ? "suspended" : "active"
    const toastId = toast.loading(next === "active" ? `Activation de ${group.name}…` : `Suspension de ${group.name}…`)
    try {
      const res = await setMutuelleGroupStatus(group.id, next)
      if (res.ok) {
        toast.success(next === "active" ? "Groupe activé" : "Groupe suspendu", { id: toastId })
      } else {
        toast.error(res.error, { id: toastId })
      }
    } catch {
      toast.error("Erreur réseau — réessayez", { id: toastId })
    }
  }

  const columns = React.useMemo(() => buildColumns(setInviteTarget, handleToggleStatus), [])

  return (
    <>
      <DataTable
        columns={columns}
        data={data}
        searchColumn="name"
        searchPlaceholder="Rechercher un groupe…"
        defaultPageSize={10}
        toolbar={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Nouveau groupe
          </Button>
        }
      />

      <CreateGroupDialog agencyOptions={agencyOptions} open={createOpen} onClose={() => setCreateOpen(false)} />

      {inviteTarget && (
        <InviteUserDialog group={inviteTarget} open={!!inviteTarget} onClose={() => setInviteTarget(null)} />
      )}
    </>
  )
}
