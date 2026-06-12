import Link from "next/link"
import { redirect } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { HeaderWrapper as Header } from "@/components/header-wrapper"
import { Footer } from "@/components/footer"
import { decodeDraft } from "@/lib/booking/draft-store"
import { BookingSteps } from "@/components/booking/booking-steps"
import dynamicImport from "next/dynamic"

export const dynamic = 'force-dynamic'

const TravelersForm = dynamicImport(() =>
  import("@/components/booking/travelers-form").then((m) => m.TravelersForm),
)

type SP = { [k: string]: string | string[] | undefined }

export default async function TravelersStepPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  const token = typeof sp.d === "string" ? sp.d : undefined
  const payload = decodeDraft(token)
  if (!payload) redirect("/")

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="bg-muted/30 flex-1 py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Link
            href={`/booking?d=${encodeURIComponent(token ?? "")}`}
            className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center text-sm"
          >
            <ChevronLeft className="size-4" />
            Retour à l&apos;offre
          </Link>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">
            Coordonnées du voyageur
          </h1>
          <p className="text-muted-foreground mb-6">
            Ces informations apparaîtront sur votre voucher de réservation.
          </p>
          <BookingSteps current={2} />
          <div className="mt-8">
            <TravelersForm token={token!} initial={payload.traveler} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
