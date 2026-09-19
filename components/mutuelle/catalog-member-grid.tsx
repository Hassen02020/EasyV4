import { Package, MapPin, Plane } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { MutuelleCatalogMemberItem } from "@/lib/mutuelle/catalog-actions"

const TYPE_META: Record<string, { label: string; icon: typeof Package }> = {
  package: { label: "Voyage organisé", icon: Package },
  activity: { label: "Activité", icon: MapPin },
  omra: { label: "Omra", icon: Plane },
}

export function CatalogMemberGrid({ items }: { items: MutuelleCatalogMemberItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm">
        <p>Votre directeur n&apos;a pas encore autorisé de produit pour votre groupe.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const meta = TYPE_META[item.productType] ?? TYPE_META.package!
        const Icon = meta.icon
        return (
          <Card key={`${item.productType}:${item.productId}`}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <Badge variant="outline" className="gap-1 text-xs">
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </Badge>
              </div>
              <p className="text-foreground text-sm font-semibold">{item.title}</p>
              {item.priceFromTnd != null ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    Prix public (référence) : à partir de {item.priceFromTnd.toFixed(3)} DT
                  </p>
                  <p className="text-sm font-bold text-violet-700">
                    Prix Mutuelle (indicatif, convention groupe) : {item.mutuellePriceFromTnd?.toFixed(3)} DT
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Tarif non encore disponible — aucun départ/session programmé pour le moment.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
