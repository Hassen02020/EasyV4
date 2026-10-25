import { Link, redirect } from "@/i18n/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { ArrowLeft, Wallet } from "lucide-react"
import { createServerSupabase } from "@/lib/supabase/server"
import { guestTenantContext } from "@/lib/hotel-suppliers/tenant/live-resolution"
import { withTenantContext } from "@/lib/db/tenant-context"
import { customers, customerTopupRequests } from "@/lib/db/schema"
import {
  getCustomerWalletBalance,
  getCustomerWalletTransactions,
} from "@/lib/finance/customer-wallet"
import { eq, and } from "drizzle-orm"
import {
  parseTopupReturnId,
  topupReturnFeedback,
  type TopupReturnFeedback,
} from "@/lib/finance/topup-return"
import { Easy2BookLogo } from "@/components/easy2book-logo"
import {
  WalletTopUpPanel,
  type ManualMethodOption,
} from "@/components/compte/wallet-topup-panel"
import {
  WalletTopupRequests,
  type TopupRequestRow,
} from "@/components/compte/wallet-topup-requests"
import {
  listCustomerTopupRequests,
  loadAvailableManualMethods,
} from "@/lib/finance/customer-topup-manual-core"
import { PaymeePaymentProvider } from "@/lib/payment/paymee-provider"
import { WalletProfileSetupForm } from "@/components/compte/wallet-profile-setup-form"
import { WalletTransactionList } from "@/components/compte/wallet-transaction-list"
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
      href: {
        pathname: "/compte/connexion",
        query: { next: "/compte/wallet" },
      },
      locale,
    })
    return null
  }

  const t = await getTranslations("Compte")
  const params = await searchParams
  // WALLET-PAYMEE-INIT-01 : `?topup=<id>` (retour Paymee) — l'état affiché
  // est celui de la demande en base, jamais celui suggéré par l'URL.
  const topupId = parseTopupReturnId(params.topup)
  let topupFeedback: TopupReturnFeedback | null = null

  let customerId: string | null = null
  let balance = 0
  let transactions: Awaited<ReturnType<typeof getCustomerWalletTransactions>> =
    []
  // WALLET-B2C-RECHARGE-METHODS-01 : moyens manuels actifs ET complets
  // uniquement ; carte proposée seulement si Paymee est configuré.
  let manualMethods: ManualMethodOption[] = []
  let topupRequests: TopupRequestRow[] = []
  const cardAvailable = new PaymeePaymentProvider().configured

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
        ;[balance, transactions] = await Promise.all([
          getCustomerWalletBalance(c.id),
          getCustomerWalletTransactions(c.id),
        ])
        ;[manualMethods, topupRequests] = await withTenantContext(
          tenant,
          async (tx) => [
            await loadAvailableManualMethods(tx, agencyId),
            await listCustomerTopupRequests(tx, c.id),
          ],
        )
        if (topupId) {
          const [request] = await withTenantContext(tenant, (tx) =>
            tx
              .select({ status: customerTopupRequests.status })
              .from(customerTopupRequests)
              .where(
                and(
                  eq(customerTopupRequests.id, topupId),
                  eq(customerTopupRequests.customerId, c.id),
                ),
              )
              .limit(1),
          )
          topupFeedback = topupReturnFeedback(request?.status)
        }
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
            <span className="text-muted-foreground text-base font-normal">
              DT
            </span>
          </p>
        </div>

        {/* Feedback success/cancel */}
        {topupFeedback === "completed" && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/20">
            <p className="font-semibold text-green-800 dark:text-green-300">
              {t("walletSuccessTitle")}
            </p>
            <p className="mt-1 text-sm text-green-700 dark:text-green-400">
              {t("walletSuccessDesc")}
            </p>
          </div>
        )}

        {topupFeedback === "pending" && (
          <div className="border-border bg-muted mb-6 rounded-2xl border p-4">
            <p className="text-foreground font-semibold">
              {t("walletPendingTitle")}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("walletPendingDesc")}
            </p>
          </div>
        )}

        {topupFeedback === "failed" && (
          <div className="bg-muted border-border mb-6 rounded-2xl border p-4">
            <p className="text-foreground font-semibold">
              {t("walletCancelledTitle")}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {t("walletCancelledDesc")}
            </p>
          </div>
        )}

        {/* Formulaire de recharge ou activation du profil */}
        {customerId ? (
          <WalletTopUpPanel
            cardAvailable={cardAvailable}
            manualMethods={manualMethods}
          />
        ) : (
          <WalletProfileSetupForm />
        )}

        {customerId && topupRequests.length > 0 && (
          <div className="mt-6">
            <WalletTopupRequests requests={topupRequests} locale={locale} />
          </div>
        )}

        {/* Historique des transactions */}
        {customerId && (
          <div className="mt-6">
            <WalletTransactionList
              transactions={transactions}
              locale={locale}
            />
          </div>
        )}
      </div>
    </div>
  )
}
