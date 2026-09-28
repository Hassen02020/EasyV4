"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { setMutuelleCatalogItem, type MutuelleCatalogBrowseItem } from "@/lib/mutuelle/catalog-actions"

const TYPE_LABELS: Record<string, string> = {
  package: "Voyage organisé",
  activity: "Activité",
  omra: "Omra",
}

function ToggleCell({ item }: { item: MutuelleCatalogBrowseItem }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function toggle() {
    startTransition(async () => {
      const result = await setMutuelleCatalogItem({
        productType: item.productType,
        productId: item.productId,
        enabled: !item.enabled,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(item.enabled ? "Produit retiré du catalogue du groupe." : "Produit ajouté au catalogue du groupe.")
      router.refresh()
    })
  }

  return (
    <Button
      size="sm"
      variant={item.enabled ? "outline" : "default"}
      className={item.enabled ? "gap-1.5 border-red-300 text-red-700 hover:bg-red-50" : "gap-1.5"}
      onClick={toggle}
      disabled={isPending}
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {item.enabled ? "Retirer" : "Ajouter"}
    </Button>
  )
}

export function CatalogDirectorTable({ items }: { items: MutuelleCatalogBrowseItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm">
        <p>Aucun produit publié dans le catalogue de l&apos;agence d&apos;exécution du groupe pour le moment.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Produit</TableHead>
            <TableHead>Prix public (à partir de)</TableHead>
            <TableHead>Statut groupe</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={`${item.productType}:${item.productId}`}>
              <TableCell className="text-sm">{TYPE_LABELS[item.productType] ?? item.productType}</TableCell>
              <TableCell className="text-sm font-medium">{item.title}</TableCell>
              <TableCell className="text-sm">
                {item.priceFromTnd != null ? `${item.priceFromTnd.toFixed(3)} DT` : "—"}
              </TableCell>
              <TableCell>
                {item.enabled ? (
                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Visible au groupe</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Non visible
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <ToggleCell item={item} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
