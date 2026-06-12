/**
 * Sandbox Page — Page de test publique pour validation UI/UX
 *
 * Cette page ne nécessite PAS de session NextAuth.
 * Elle permet de tester les composants frontend :
 *   - WalletStatus (faux header)
 *   - OmraBookingForm (avec données simulées)
 *   - TransferBookingForm
 */

import { WalletStatus } from "@/components/pro/wallet-status"
import { OmraBookingForm } from "@/components/omra/omra-booking-form"
import { TransferBookingForm } from "@/components/transfer/transfer-booking-form"
import { Separator } from "@/components/ui/separator"
import { Wallet, Car, User } from "lucide-react"

const MOCK_AGENCY_ID = "00000000-0000-0000-0000-000000000001"

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

export default function SandboxPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Faux Header avec WalletStatus */}
      <header className="sticky top-0 z-50 bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#1e3a8a] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">E2B</span>
              </div>
              <span className="font-semibold text-[#1e3a8a]">Easy2Book Sandbox</span>
            </div>
            <WalletStatus agencyId={MOCK_AGENCY_ID} compact />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
        {/* Section Info */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            <strong>Page de test publique</strong> — Cette page ne nécessite pas d'authentification.
            Les formulaires utilisent des données simulées (mock data) pour validation UI/UX uniquement.
          </p>
        </div>

        {/* Section Omra */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-6 h-6 text-[#1e3a8a]" />
            <h2 className="text-2xl font-bold text-[#1e3a8a]">Module Omra</h2>
          </div>
          <p className="text-muted-foreground">
            Formulaire de réservation Omra de groupe avec ajout dynamique de pèlerins.
            <br />
            <span className="text-xs text-muted-foreground">
              Tarifs simulés : Single {MOCK_OMRA_PACKAGE.roomPricing.single} DT | Double {MOCK_OMRA_PACKAGE.roomPricing.double} DT | Triple {MOCK_OMRA_PACKAGE.roomPricing.triple} DT | Quad {MOCK_OMRA_PACKAGE.roomPricing.quad} DT
            </span>
          </p>
          <OmraBookingForm />
        </section>

        <Separator className="my-8" />

        {/* Section Transferts */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Car className="w-6 h-6 text-[#1e3a8a]" />
            <h2 className="text-2xl font-bold text-[#1e3a8a]">Module Transferts</h2>
          </div>
          <p className="text-muted-foreground">
            Formulaire de réservation de transfert avec calcul de devis en temps réel.
          </p>
          <TransferBookingForm />
        </section>

        <Separator className="my-8" />

        {/* Section Wallet Status (Full) */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-6 h-6 text-[#1e3a8a]" />
            <h2 className="text-2xl font-bold text-[#1e3a8a]">Wallet Status (Full)</h2>
          </div>
          <p className="text-muted-foreground">
            Composant WalletStatus en mode complet (non compact) pour vérifier l'alignement du solde.
          </p>
          <div className="max-w-md">
            <WalletStatus agencyId={MOCK_AGENCY_ID} />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          <p>Easy2Book Sandbox — Page de test UI/UX</p>
          <p className="mt-1">Non accessible en production</p>
        </div>
      </footer>
    </div>
  )
}
