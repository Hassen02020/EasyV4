/**
 * Super Admin — moyens de recharge wallet B2C manuels et leurs coordonnées
 * (WALLET-B2C-RECHARGE-METHODS-01). Un moyen inactif ou incomplet n'est
 * jamais proposé aux clients. Aucune coordonnée n'est pré-remplie.
 */

import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { ArrowLeft } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { withTenantContext } from "@/lib/db/tenant-context"
import { topupPaymentMethods } from "@/lib/db/schema"
import {
  MANUAL_TOPUP_METHODS,
  TOPUP_METHOD_FIELDS,
} from "@/lib/finance/customer-topup-manual-core"
import { TOPUP_METHOD_LABELS_FR } from "@/lib/finance/topup-method-display"
import { TopupMethodConfigForm } from "@/components/admin/topup-method-config-form"

export const metadata: Metadata = {
  title: "Moyens de recharge clients — Admin",
}

export const dynamic = "force-dynamic"

const FIELD_LABELS: Record<string, { label: string; hint?: string }> = {
  beneficiary: { label: "Bénéficiaire / titulaire" },
  bank_name: { label: "Banque" },
  rib: { label: "RIB", hint: "20 chiffres (espaces acceptés)." },
  iban: { label: "IBAN", hint: "Format TN + 22 chiffres." },
  bic: { label: "BIC / SWIFT", hint: "8 ou 11 caractères." },
  agency_name: { label: "Nom de l'agence" },
  address: { label: "Adresse" },
  opening_hours: { label: "Horaires d'encaissement" },
  phone: { label: "Téléphone" },
  d17_number: { label: "Numéro D17", hint: "8 chiffres." },
}

export default async function TopupMethodsPage() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/admin/accounting/recharges/moyens")

  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") redirect("/admin/accounting/recharges")

  const { getDefaultAgencyId } = await import("@/lib/agencies/default-agency")
  const agencyId = await getDefaultAgencyId()

  const rows = agencyId
    ? await withTenantContext(
        { agencyId: null, userId: user.id, isSuperAdmin: true },
        (db) =>
          db
            .select()
            .from(topupPaymentMethods)
            .where(eq(topupPaymentMethods.agencyId, agencyId)),
      )
    : []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild aria-label="Retour">
          <Link href="/admin/accounting/recharges">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Moyens de recharge clients</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Coordonnées affichées aux clients sur la page « Mon portefeuille ».
            Un moyen n&apos;est proposé que s&apos;il est coché et que tous ses
            champs obligatoires sont renseignés. Saisissez uniquement des
            coordonnées officielles vérifiées.
          </p>
        </div>
      </div>

      {!agencyId ? (
        <p className="text-sm text-red-500">
          Agence B2C par défaut introuvable.
        </p>
      ) : (
        MANUAL_TOPUP_METHODS.map((method) => {
          const row = rows.find((r) => r.method === method)
          const fields = Object.entries(TOPUP_METHOD_FIELDS[method]).map(
            ([key, rule]) => ({
              key,
              label: FIELD_LABELS[key]?.label ?? key,
              hint: FIELD_LABELS[key]?.hint,
              required: rule.required,
            }),
          )
          return (
            <Card key={method}>
              <CardContent className="pt-6">
                <TopupMethodConfigForm
                  method={method}
                  title={TOPUP_METHOD_LABELS_FR[method]}
                  fields={fields}
                  initialEnabled={row?.enabled ?? false}
                  initialDetails={row?.details ?? {}}
                  initialInstructions={row?.instructions ?? ""}
                />
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
