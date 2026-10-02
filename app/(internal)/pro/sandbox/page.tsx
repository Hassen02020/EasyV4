/**
 * Sandbox Page — Page de test publique pour validation UI/UX
 *
 * Cette page ne nécessite PAS de session NextAuth.
 * Elle permet de tester les composants frontend :
 *   - WalletStatus (faux header)
 *   - OmraBookingForm (avec données simulées)
 *   - TransferBookingForm
 */

import { notFound } from "next/navigation"
import { WalletStatus } from "@/components/pro/wallet-status"
import { OmraBookingForm } from "@/components/omra/omra-booking-form"
import { TransferBookingForm } from "@/components/transfer/transfer-booking-form"
import { Separator } from "@/components/ui/separator"
import { Wallet, Car, User } from "lucide-react"
import { withSystemContext } from "@/lib/db/tenant-context"
import { catalogTransferZones } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

const MOCK_AGENCY_ID = "00000000-0000-0000-0000-000000000001"

async function getActiveZones() {
  try {
    // Page sandbox sans session — catalogue public.
    return await withSystemContext((db) =>
      db
        .select()
        .from(catalogTransferZones)
        .where(eq(catalogTransferZones.status, "active"))
        .orderBy(catalogTransferZones.name),
    )
  } catch {
    return []
  }
}

// Faux forfait Omra avec tarifs par type de chambre
const MOCK_OMRA_PACKAGE = {
  id: "pkg-sandbox-001",
  name: "Omra Ramadan 2026 - 10 jours (Sandbox)",
  basePrice: 2500,
  durationDays: 10,
  roomPricing: {
    single: 3200,
    double: 2800,
    triple: 2600,
    quad: 2500,
  },
}

export default async function SandboxPage() {
  // Page de test sans session, contre une agence fictive — jamais joignable
  // en production (voir footer). Rien d'autre ne la protégeait jusqu'ici :
  // pas dans le groupe de routes app/pro/(app) donc pas de gate du layout,
  // et aucun middleware racine dans ce repo.
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  const zones = await getActiveZones()

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Faux Header avec WalletStatus */}
      <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-sidebar flex h-8 w-8 items-center justify-center rounded-lg">
                <span className="text-sm font-bold text-white">E2B</span>
              </div>
              <span className="text-sidebar font-semibold">
                Easy2Book Sandbox
              </span>
            </div>
            <WalletStatus agencyId={MOCK_AGENCY_ID} compact />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6 lg:px-8">
        {/* Section Info */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            <strong>Page de test publique</strong> — Cette page ne nécessite pas
            d&apos;authentification. Les formulaires utilisent des données
            simulées (mock data) pour validation UI/UX uniquement.
          </p>
        </div>

        {/* Section Omra */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="text-sidebar h-6 w-6" />
            <h2 className="text-sidebar text-2xl font-bold">Module Omra</h2>
          </div>
          <p className="text-muted-foreground">
            Formulaire de réservation Omra de groupe avec ajout dynamique de
            pèlerins.
            <br />
            <span className="text-muted-foreground text-xs">
              Tarifs simulés : Single {MOCK_OMRA_PACKAGE.roomPricing.single} DT
              | Double {MOCK_OMRA_PACKAGE.roomPricing.double} DT | Triple{" "}
              {MOCK_OMRA_PACKAGE.roomPricing.triple} DT | Quad{" "}
              {MOCK_OMRA_PACKAGE.roomPricing.quad} DT
            </span>
          </p>
          <OmraBookingForm />
        </section>

        <Separator className="my-8" />

        {/* Section Transferts */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Car className="text-sidebar h-6 w-6" />
            <h2 className="text-sidebar text-2xl font-bold">
              Module Transferts
            </h2>
          </div>
          <p className="text-muted-foreground">
            Formulaire de réservation de transfert avec calcul de devis en temps
            réel.
          </p>
          <TransferBookingForm zones={zones} agencyId={MOCK_AGENCY_ID} />
        </section>

        <Separator className="my-8" />

        {/* Section Wallet Status (Full) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="text-sidebar h-6 w-6" />
            <h2 className="text-sidebar text-2xl font-bold">
              Wallet Status (Full)
            </h2>
          </div>
          <p className="text-muted-foreground">
            Composant WalletStatus en mode complet (non compact) pour vérifier
            l&apos;alignement du solde.
          </p>
          <div className="max-w-md">
            <WalletStatus agencyId={MOCK_AGENCY_ID} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t bg-white py-6">
        <div className="text-muted-foreground mx-auto max-w-7xl px-4 text-center text-sm sm:px-6 lg:px-8">
          <p>Easy2Book Sandbox — Page de test UI/UX</p>
          <p className="mt-1">Non accessible en production</p>
        </div>
      </footer>
    </div>
  )
}
