import { redirect } from "next/navigation"

/** Le nav sidebar pointe ici, mais la vraie file d'attente paiements vit à /admin/finance/pending-payments. */
export default function AccountingPaymentsPage() {
  redirect("/admin/finance/pending-payments")
}
