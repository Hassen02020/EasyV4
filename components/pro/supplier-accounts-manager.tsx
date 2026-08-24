"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Plug,
  Plus,
  MoreHorizontal,
  PlugZap,
  Ban,
  CheckCircle2,
  KeyRound,
  Loader2,
  Users2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createOwnSupplierAccount,
  rotateOwnSupplierCredentials,
  setOwnSupplierAccountStatus,
  testOwnSupplierConnection,
  type AgencySupplierAccountRow,
} from "@/lib/hotel-suppliers/tenant/agency-accounts"

interface SupplierOption {
  id: string
  code: string
  name: string
  documentationStatus: string
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  active: { label: "Actif", className: "bg-emerald-100 text-emerald-800" },
  disabled: { label: "Désactivé", className: "bg-gray-100 text-gray-800" },
  invalid_credentials: { label: "Identifiants invalides", className: "bg-red-100 text-red-800" },
  not_configured: { label: "Non configuré", className: "bg-gray-100 text-gray-600" },
  error: { label: "Erreur", className: "bg-red-100 text-red-800" },
}

export function SupplierAccountsManager({
  accounts,
  suppliers,
  canManage,
}: {
  accounts: AgencySupplierAccountRow[]
  suppliers: SupplierOption[]
  canManage: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [createOpen, setCreateOpen] = useState(false)
  const [rotateFor, setRotateFor] = useState<AgencySupplierAccountRow | null>(null)

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "")
  const [displayName, setDisplayName] = useState("")
  const [mode, setMode] = useState<"live" | "virtual">("live")
  const [priority, setPriority] = useState("100")
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")

  function resetCreateForm() {
    setDisplayName("")
    setLogin("")
    setPassword("")
    setPriority("100")
    setMode("live")
  }

  function handleCreate() {
    startTransition(async () => {
      const result = await createOwnSupplierAccount({
        supplierId,
        displayName,
        mode,
        priority: Number(priority) || 100,
        login,
        password,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Compte fournisseur créé.")
      setCreateOpen(false)
      resetCreateForm()
      router.refresh()
    })
  }

  function handleTest(accountId: string) {
    startTransition(async () => {
      const result = await testOwnSupplierConnection(accountId)
      if (!result.ok) {
        toast.error(`Test échoué : ${result.error}`)
        return
      }
      toast.success("Connexion vérifiée avec succès.")
      router.refresh()
    })
  }

  function handleToggleStatus(accountId: string, currentStatus: string) {
    startTransition(async () => {
      const result = await setOwnSupplierAccountStatus(accountId, currentStatus === "active" ? "disabled" : "active")
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Statut mis à jour.")
      router.refresh()
    })
  }

  function handleRotate() {
    if (!rotateFor) return
    startTransition(async () => {
      const result = await rotateOwnSupplierCredentials(rotateFor.id, login, password)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Identifiants mis à jour.")
      setRotateFor(null)
      setLogin("")
      setPassword("")
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-sidebar">
                <Plus className="mr-2 h-4 w-4" />
                Nouveau compte fournisseur
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nouveau compte fournisseur</DialogTitle>
                <DialogDescription>
                  Votre propre compte, séparé de tout compte partagé — vos identifiants sont chiffrés et ne sont
                  jamais visibles par une autre agence.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label>Fournisseur</Label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id} disabled={s.documentationStatus !== "documented"}>
                          {s.name} {s.documentationStatus !== "documented" ? "(documentation requise)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Nom d&apos;affichage</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex. myGo — Mon compte" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Mode</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as "live" | "virtual")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="live">Live (réel)</SelectItem>
                        <SelectItem value="virtual">Virtual (simulateur)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Priorité</Label>
                    <Input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Login</Label>
                  <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off" />
                </div>
                <div className="grid gap-2">
                  <Label>Mot de passe</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={isPending || !supplierId}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer le compte"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Compte</TableHead>
            <TableHead>Fournisseur</TableHead>
            <TableHead>Origine</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Dernier test</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                Aucun compte fournisseur disponible. {canManage ? "Créez-en un pour commencer." : "Contactez votre administrateur."}
              </TableCell>
            </TableRow>
          ) : (
            accounts.map((a) => {
              const statusConfig = STATUS_LABEL[a.status] ?? STATUS_LABEL.not_configured
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-lg">
                        <Plug className="h-4 w-4" />
                      </div>
                      <p className="font-medium">{a.displayName}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{a.supplierName}</Badge>
                  </TableCell>
                  <TableCell>
                    {a.isOwnAccount ? (
                      <span className="text-sm">Mon compte</span>
                    ) : (
                      <Badge variant="outline">
                        <Users2 className="mr-1 h-3 w-3" />
                        Partagé — {a.ownerType === "master" ? "Master" : "Autre agence"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusConfig!.className}>{statusConfig!.label}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {a.lastTestedAt ? new Date(a.lastTestedAt).toLocaleString("fr-FR") : "Jamais"}
                    {a.lastTestStatus ? ` · ${a.lastTestStatus}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions pour ${a.displayName}`} disabled={isPending}>
                          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleTest(a.id) }}>
                          <PlugZap className="mr-2 h-4 w-4" />
                          Tester la connexion
                        </DropdownMenuItem>
                        {canManage && a.isOwnAccount && (
                          <>
                            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setRotateFor(a) }}>
                              <KeyRound className="mr-2 h-4 w-4" />
                              Changer les identifiants
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className={a.status === "active" ? "text-destructive" : "text-success"}
                              onSelect={(e) => { e.preventDefault(); handleToggleStatus(a.id, a.status) }}
                            >
                              {a.status === "active" ? <Ban className="mr-2 h-4 w-4" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                              {a.status === "active" ? "Désactiver" : "Activer"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      <Dialog open={!!rotateFor} onOpenChange={(open) => !open && setRotateFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer les identifiants — {rotateFor?.displayName}</DialogTitle>
            <DialogDescription>L&apos;ancien secret n&apos;est jamais affiché ni récupérable.</DialogDescription>
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
    </div>
  )
}
