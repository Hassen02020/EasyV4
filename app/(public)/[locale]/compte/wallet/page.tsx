import { Link, redirect } from "@/i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { ArrowLeft, Wallet } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers } from "@/lib/db/schema"
import { getCustomerWalletBalance } from "@/lib/finance/customer-wallet"
import { eq, and } from "drizzle-orm"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import { WalletTopUpForm } from "@/components/compte/wallet-topup-form"
import { buildLanguageAlternates } from "@/lib/seo/alternate-languages"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Mon portefeuille | Easy2Book",
  description: "Rechargez votre portefeuille Easy2Book.",
  alternates: { languages: buildLanguageAlternates("/compte/wallet") },
}

interface Props {
  searchParams: Promise<{ topup?: string }>
}

export default async function WalletPage({ searchParams }: Props) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const locale = await getLocale()

  if (!user) {
    redirect({
      href: { pathname: "/compte/connexion", query: { next: "/compte/wallet" } },
      locale,
    })
    return null
  }

  const t = await getTranslations("Compte")
  const params = await searchParams
  const topupStatus = params.topup // "success" | "cancelled" | undefined

  let customerId: string | null = null
  let balance = 0

  try {
    const tenant = await guestTenantContext()
    if (tenant && tenant.agencyId) {
      const agencyId = tenant.agencyId
      const rows = await withTenantContext(tenant, (tx) =>
        tx
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.authUserId, user.id),
              eq(customers.agencyId, agencyId),
            ),
          )
          .limit(1),
      )
      const c = rows[0]
      if (c) {
        customerId = c.id
        balance = await getCustomerWalletBalance(c.id)
      }
    }
  } catch {
    // Non bloquant — affiche balance = 0
  }

  return (
    <div className="from-background via-background to-accent/5 min-h-screen bg-gradient-to-br">
      <div className="border-border border-b bg-white/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Easy2BookLogo
              withWordmark={false}
              className="bg-muted size-9"
              priority
            />
            <span className="text-base font-bold">
              <span className="text-sidebar">Easy</span>
              <span className="text-accent">2</span>
              <span className="text-sidebar">Book</span>
            </span>
          </Link>
          <Link
            href="/compte"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("walletBackToAccount")}
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="bg-accent/10 rounded-xl p-2">
            <Wallet className="text-accent h-6 w-6" />
          </div>
          <div>
            <h1 className="text-foreground text-2xl font-bold">
              {t("walletPageTitle")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("walletPageSubtitle")}
            </p>
          </div>
        </div>

        {/* Solde actuel */}
        <div className="bg-card border-border mb-6 rounded-2xl border p-6">
          <p className="text-muted-foreground text-sm font-medium">
            {t("walletCurrentBalance")}
          </p>
          <p className="text-foreground mt-2 text-3xl font-bold tabular-nums">
            {balance.toFixed(3)}{" "}
            <span className="text-muted-foreground text-base font-normal">DT</span>
          </p>
        </div>

        {/* Feedback success/cancel */}
        {topupStatus === "success" && (
          <div className="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800 mb-6 rounded-2xl border p-4">
            <p className="font-semibold text-green-800 dark:text-green-300">
              {t("walletSuccessTitle")}
            </p>
            <p className="text-green-700 dark:text-green-400 mt-1 text-sm">
              {t("walletSuccessDesc")}
            </p>
          </div>
        )}

        {topupStatus === "cancelled" && (
          <div className="bg-muted border-border mb-6 rounded-2xl border p-4">
            <p className="text-foreground font-semibold">{t("walletCancelledTitle")}</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("walletCancelledDesc")}
            </p>
          </div>
        )}

        {/* Formulaire de recharge */}
        {customerId ? (
          <WalletTopUpForm />
        ) : (
          <div className="bg-muted border-border rounded-2xl border p-6 text-center">
            <p className="text-muted-foreground text-sm">
              Profil client introuvable. Effectuez d&apos;abord une réservation pour activer votre portefeuille.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
