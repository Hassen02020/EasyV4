import { Gift } from "lucide-react"
import { pointsToTndEquivalent, MIN_REDEMPTION_POINTS } from "@/lib/loyalty/rewards-core"

/**
 * Easy2Book Rewards (Phase 38D) — affichage seul, `/compte`. La rédemption
 * (`redeemPoints`) reste un mouvement de grand livre non branché au
 * checkout en V1 (voir doc de tête lib/loyalty/rewards-core.ts) — pas de
 * bouton "utiliser mes points" ici tant que cette intégration Paiement
 * n'existe pas, pour ne jamais promettre une réduction qui ne s'applique
 * pas réellement au règlement.
 */
export function CompteLoyaltyCard({
  pendingPoints,
  availablePoints,
}: {
  pendingPoints: number
  availablePoints: number
}) {
  if (pendingPoints <= 0 && availablePoints <= 0) return null

  return (
    <div className="bg-card border-border mb-6 rounded-2xl border p-4">
      <div className="mb-2 flex items-center gap-2">
        <Gift className="text-accent h-4 w-4" />
        <span className="text-foreground text-sm font-semibold">Easy2Book Rewards</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div>
          <span className="text-foreground text-2xl font-bold">{availablePoints}</span>
          <span className="text-muted-foreground ml-1.5 text-sm">
            points disponibles (≈ {pointsToTndEquivalent(availablePoints).toFixed(2)} DT)
          </span>
        </div>
        {pendingPoints > 0 && (
          <div>
            <span className="text-muted-foreground text-sm">
              + {pendingPoints} points en attente (dès la fin de votre séjour)
            </span>
          </div>
        )}
      </div>
      {availablePoints < MIN_REDEMPTION_POINTS && (
        <p className="text-muted-foreground mt-2 text-xs">
          Rédemption possible à partir de {MIN_REDEMPTION_POINTS} points disponibles.
        </p>
      )}
    </div>
  )
}
