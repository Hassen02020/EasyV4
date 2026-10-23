/**
 * Moteur de recherche des règles fiscales — TAX-RULES-SUPERADMIN-01, LOT 5.
 *
 * Résolution 4-passes (wildcard) :
 *   Pass 1 : country=exact  + module=exact   (priorité maximale)
 *   Pass 2 : country=exact  + module='*'
 *   Pass 3 : country='*'    + module=exact
 *   Pass 4 : country='*'    + module='*'     (priorité minimale)
 *
 * La première passe qui retourne une règle active gagne.
 * Fail-closed : si aucune règle active trouvée → null.
 */

import { and, eq, gt, isNull, lte, or } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { fiscalRules } from "@/lib/db/schema"
import type { FiscalRule } from "@/lib/db/schema"

export type ActiveFiscalRule = Pick<
  FiscalRule,
  | "id"
  | "country"
  | "module"
  | "fiscalClassification"
  | "vatRate"
  | "version"
  | "validationRef"
  | "note"
>

/**
 * Recherche la règle fiscale active applicable à (country, module) à la date atDate.
 * Retourne null si aucune règle active n'est trouvée (fail-closed).
 */
export async function getActiveFiscalRule(
  country: string,
  module: string,
  atDate: Date,
): Promise<ActiveFiscalRule | null> {
  const passes: Array<[string, string]> = [
    [country, module],
    [country, "*"],
    ["*", module],
    ["*", "*"],
  ]

  for (const [c, m] of passes) {
    const [rule] = await getDb()
      .select({
        id: fiscalRules.id,
        country: fiscalRules.country,
        module: fiscalRules.module,
        fiscalClassification: fiscalRules.fiscalClassification,
        vatRate: fiscalRules.vatRate,
        version: fiscalRules.version,
        validationRef: fiscalRules.validationRef,
        note: fiscalRules.note,
      })
      .from(fiscalRules)
      .where(
        and(
          eq(fiscalRules.country, c),
          eq(fiscalRules.module, m),
          eq(fiscalRules.status, "active"),
          lte(fiscalRules.effectiveFrom, atDate),
          or(
            isNull(fiscalRules.effectiveTo),
            gt(fiscalRules.effectiveTo, atDate),
          ),
        ),
      )
      .limit(1)

    if (rule) return rule
  }

  return null
}

/**
 * Comme getActiveFiscalRule mais accepte une transaction Drizzle.
 * Utilisé dans les booking-actions pour garantir la cohérence transactionnelle.
 */
export async function getActiveFiscalRuleInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  country: string,
  module: string,
  atDate: Date,
): Promise<ActiveFiscalRule | null> {
  const passes: Array<[string, string]> = [
    [country, module],
    [country, "*"],
    ["*", module],
    ["*", "*"],
  ]

  for (const [c, m] of passes) {
    const [rule] = await tx
      .select({
        id: fiscalRules.id,
        country: fiscalRules.country,
        module: fiscalRules.module,
        fiscalClassification: fiscalRules.fiscalClassification,
        vatRate: fiscalRules.vatRate,
        version: fiscalRules.version,
        validationRef: fiscalRules.validationRef,
        note: fiscalRules.note,
      })
      .from(fiscalRules)
      .where(
        and(
          eq(fiscalRules.country, c),
          eq(fiscalRules.module, m),
          eq(fiscalRules.status, "active"),
          lte(fiscalRules.effectiveFrom, atDate),
          or(
            isNull(fiscalRules.effectiveTo),
            gt(fiscalRules.effectiveTo, atDate),
          ),
        ),
      )
      .limit(1)

    if (rule) return rule
  }

  return null
}
