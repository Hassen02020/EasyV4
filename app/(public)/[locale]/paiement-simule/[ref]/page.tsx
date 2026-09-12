/**
 * Page de paiement simulée — Virtual Payment Provider (test/dev
 * uniquement, voir lib/payment/virtual-payment-provider.ts). Simule le
 * modèle réel d'un PSP hébergé (SPS Monétique Tunisie/Paymee/Stripe
 * Checkout) sans jamais confirmer localement : "Simuler" déclenche le vrai
 * webhook signé (lib/payment/virtual-checkout-actions.ts::simulateVirtualPayment).
 */

import { notFound } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getVirtualPaymentSession } from "@/lib/payment/virtual-checkout-actions"
import { isVirtualPaymentModeEnabled } from "@/lib/payment/virtual-payment-provider"
import { VirtualCheckoutPanel } from "@/components/payment/virtual-checkout-panel"

export const dynamic = "force-dynamic"

export default async function VirtualPaymentPage({ params }: { params: Promise<{ ref: string }> }) {
  if (!isVirtualPaymentModeEnabled()) notFound()
  const { ref: paymentRef } = await params
  const session = await getVirtualPaymentSession(paymentRef)

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
        <Alert className="mb-6 border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Environnement de simulation</AlertTitle>
          <AlertDescription>
            Cette page imite une page de paiement PSP hébergée (SPS Monétique Tunisie) à des fins de
            test — aucun vrai paiement n&apos;a lieu.
          </AlertDescription>
        </Alert>

        {session.ok ? (
          <VirtualCheckoutPanel
            paymentRef={paymentRef}
            amountTnd={session.amountTnd}
            publicRef={session.publicRef}
            guestAccessToken={session.guestAccessToken}
            offerLabel={session.offerLabel}
          />
        ) : (
          <Alert variant="destructive">
            <AlertDescription>{session.error}</AlertDescription>
          </Alert>
        )}
      </main>
      <Footer />
    </div>
  )
}
