import { redirect } from "next/navigation"

/** Le rapport CA réel vit dans l'onglet "Rapports" de /admin/accounting. */
export default function AccountingReportsPage() {
  redirect("/admin/accounting")
}
