/**
 * Page de retour générique après un paiement en ligne redirect-based réel
 * (SPS/Paymee/Stripe Checkout) — le PSP redirige le navigateur ici
 * (`return_url`/`cancel_url`) une fois le client revenu de sa page de
 * paiement hébergée. Ne confirme JAMAIS une réservation : simple lookup
 * (lib/payment/payment-return-actions.ts) puis redirection vers l'état RÉEL
 * de la réservation (`/booking/confirmation/[ref]`, qui affiche déjà
 * correctement "en attente de validation" tant que le webhook signé n'est
 * pas passé, ou "confirmée" une fois qu'il l'est) — jamais une confirmation
 * déduite du seul retour navigateur (voir note de fichier de
 * payment-return-actions.ts).
 */

import { redirect } from "next/navigation"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { getPaymentReturnTarget } from "@/lib/payment/payment-return-actions"

export const dynamic = "force-dynamic"

export default async function PaymentReturnPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const target = await getPaymentReturnTarget(ref)

  if (target.ok) {
    redirect(`/booking/confirmation/${target.publicRef}?token=${target.guestAccessToken}`)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-12">
        <Alert variant="destructive">
          <AlertDescription>{target.error}</AlertDescription>
        </Alert>
      </main>
      <Footer />
    </div>
  )
}
