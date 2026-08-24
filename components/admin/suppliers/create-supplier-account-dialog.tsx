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
import { createSupplierAccount } from "@/lib/hotel-suppliers/tenant/accounts"

interface SupplierOption {
  id: string
  code: string
  name: string
  documentationStatus: string
}

interface AgencyOption {
  id: string
  name: string
  agencyType: string
  domain: string | null
}

export function CreateSupplierAccountDialog({
  suppliers,
  agencies,
}: {
  suppliers: SupplierOption[]
  agencies: AgencyOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "")
  const [ownerAgencyId, setOwnerAgencyId] = useState(agencies[0]?.id ?? "")
  const [displayName, setDisplayName] = useState("")
  const [mode, setMode] = useState<"live" | "virtual">("live")
  const [priority, setPriority] = useState("100")
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")

  function reset() {
    setDisplayName("")
    setLogin("")
    setPassword("")
    setPriority("100")
    setMode("live")
  }

  function handleSubmit() {
    startTransition(async () => {
      const result = await createSupplierAccount({
        supplierId,
        ownerAgencyId,
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
      setOpen(false)
      reset()
      router.refresh()
    })
  }

  const agency = agencies.find((a) => a.id === ownerAgencyId)
  const ownerTypePreview =
    agency?.agencyType !== "ota" ? "agence partenaire" : agency?.domain ? "marque blanche" : "master (Easy2Book)"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            Un compte appartient à UNE agence (master, partenaire ou marque blanche) — jamais partagé implicitement.
            Les identifiants sont chiffrés dès la création, jamais stockés en clair.
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
            <Label>Agence propriétaire</Label>
            <Select value={ownerAgencyId} onValueChange={setOwnerAgencyId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {agencies.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">Type détecté : {ownerTypePreview}</p>
          </div>

          <div className="grid gap-2">
            <Label>Nom d&apos;affichage</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex. myGo — Compte Easy2Book" />
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
          <Button onClick={handleSubmit} disabled={isPending || !supplierId || !ownerAgencyId}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer le compte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
