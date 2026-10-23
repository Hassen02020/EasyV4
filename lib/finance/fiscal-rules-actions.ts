"use server"

/**
 * Actions serveur — Moteur de règles fiscales (TAX-RULES-SUPERADMIN-01, LOT 5).
 *
 * Sécurité :
 *  - Lecture : accounting (accounting.view)
 *  - Écriture : super_admin uniquement (vérifié serveur)
 *
 * Verrou transactionnel :
 *  - pg_advisory_xact_lock(hashtext(country || ':' || module)) acquis
 *    AVANT le contrôle de chevauchement ET l'activation — même clé partout.
 *
 * Chevauchement :
 *  - Interdit : deux règles actives avec le même (country, module) et des
 *    périodes qui se chevauchent → erreur FISCAL_RULE_OVERLAP.
 *  - Anti-backdate : effectiveFrom doit être >= NOW() pour toute nouvelle règle.
 */

import { and, eq, gt, isNull, lt, lte, ne, or, sql } from "drizzle-orm"
import { getDb } from "@/lib/db/client"
import { fiscalRules } from "@/lib/db/schema"
import { resolveSessionContext } from "@/lib/db/tenant-context"
import type { FiscalRule, NewFiscalRule } from "@/lib/db/schema"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FiscalRuleListItem = Pick<
  FiscalRule,
  | "id"
  | "country"
  | "module"
  | "fiscalClassification"
  | "vatRate"
  | "status"
  | "effectiveFrom"
  | "effectiveTo"
  | "version"
  | "validationRef"
  | "note"
  | "createdAt"
  | "activatedAt"
>

export type ListFiscalRulesResult =
  | { ok: true; rules: FiscalRuleListItem[] }
  | { ok: false; error: string; code?: string }

export type CreateDraftFiscalRuleInput = {
  country: string
  module: string
  fiscalClassification: "standard" | "zero_rated" | "exempt" | "out_of_scope"
  vatRate: number
  effectiveFrom: Date
  effectiveTo?: Date | null
  note?: string | null
}

export type CreateDraftFiscalRuleResult =
  | { ok: true; ruleId: string }
  | { ok: false; error: string; code?: string }

export type ActivateFiscalRuleInput = {
  ruleId: string
  validationRef: string
}

export type ActivateFiscalRuleResult =
  | { ok: true; ruleId: string }
  | { ok: false; error: string; code?: string }

export type DeactivateFiscalRuleResult =
  | { ok: true; ruleId: string }
  | { ok: false; error: string; code?: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function advisoryLockKey(country: string, module: string): string {
  return `${country}:${module}`
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Liste toutes les règles fiscales (lecture — accounting.view requis).
 */
export async function listFiscalRules(): Promise<ListFiscalRulesResult> {
  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié", code: "UNAUTHENTICATED" }

  const rules = await getDb()
    .select({
      id: fiscalRules.id,
      country: fiscalRules.country,
      module: fiscalRules.module,
      fiscalClassification: fiscalRules.fiscalClassification,
      vatRate: fiscalRules.vatRate,
      status: fiscalRules.status,
      effectiveFrom: fiscalRules.effectiveFrom,
      effectiveTo: fiscalRules.effectiveTo,
      version: fiscalRules.version,
      validationRef: fiscalRules.validationRef,
      note: fiscalRules.note,
      createdAt: fiscalRules.createdAt,
      activatedAt: fiscalRules.activatedAt,
    })
    .from(fiscalRules)
    .orderBy(fiscalRules.country, fiscalRules.module, fiscalRules.effectiveFrom)

  return { ok: true, rules }
}

/**
 * Crée une règle fiscale en mode draft (super_admin uniquement).
 * La règle ne s'applique pas tant qu'elle n'est pas activée.
 */
export async function createDraftFiscalRule(
  input: CreateDraftFiscalRuleInput,
): Promise<CreateDraftFiscalRuleResult> {
  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié", code: "UNAUTHENTICATED" }
  if (!session.isSuperAdmin) {
    return { ok: false, error: "Accès réservé au super admin", code: "FORBIDDEN" }
  }

  if (!input.country || !input.module) {
    return { ok: false, error: "Pays et module requis", code: "VALIDATION_ERROR" }
  }
  if (!["standard", "zero_rated", "exempt", "out_of_scope"].includes(input.fiscalClassification)) {
    return { ok: false, error: "Classification fiscale invalide", code: "VALIDATION_ERROR" }
  }
  if (input.vatRate < 0 || input.vatRate > 100) {
    return { ok: false, error: "Taux TVA invalide (0–100)", code: "VALIDATION_ERROR" }
  }
  if (input.effectiveFrom <= new Date()) {
    return {
      ok: false,
      error: "La date d'entrée en vigueur doit être dans le futur (anti-backdate)",
      code: "BACKDATE_FORBIDDEN",
    }
  }

  // Version = max(version pour ce country+module) + 1
  const [versionRow] = await getDb()
    .select({ maxVersion: sql<number>`COALESCE(MAX(${fiscalRules.version}), 0)` })
    .from(fiscalRules)
    .where(
      and(
        eq(fiscalRules.country, input.country),
        eq(fiscalRules.module, input.module),
      ),
    )

  const nextVersion = (versionRow?.maxVersion ?? 0) + 1

  const [created] = await getDb()
    .insert(fiscalRules)
    .values({
      country: input.country,
      module: input.module,
      fiscalClassification: input.fiscalClassification,
      vatRate: String(input.vatRate),
      status: "draft",
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
      version: nextVersion,
      note: input.note ?? null,
      createdBy: session.userId,
    } satisfies Omit<NewFiscalRule, "id" | "createdAt" | "validationRef" | "activatedBy" | "activatedAt">)
    .returning({ id: fiscalRules.id })

  return { ok: true, ruleId: created.id }
}

/**
 * Active une règle draft (super_admin uniquement).
 *
 * Séquence :
 *  1. Acquérir le verrou advisory (country:module) dans la transaction.
 *  2. Vérifier l'absence de chevauchement avec les règles actives existantes.
 *  3. Activer la règle (status draft → active).
 *
 * Le verrou advisory garantit qu'aucune activation concurrente sur le même
 * (country, module) ne peut passer simultanément.
 */
export async function activateFiscalRule(
  input: ActivateFiscalRuleInput,
): Promise<ActivateFiscalRuleResult> {
  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié", code: "UNAUTHENTICATED" }
  if (!session.isSuperAdmin) {
    return { ok: false, error: "Accès réservé au super admin", code: "FORBIDDEN" }
  }
  if (!input.validationRef?.trim()) {
    return {
      ok: false,
      error: "Référence de validation obligatoire",
      code: "VALIDATION_REF_REQUIRED",
    }
  }

  try {
    const result = await getDb().transaction(async (tx) => {
      // 1. Lire la règle à activer
      const [rule] = await tx
        .select()
        .from(fiscalRules)
        .where(eq(fiscalRules.id, input.ruleId))
        .limit(1)

      if (!rule) throw new Error("RULE_NOT_FOUND")
      if (rule.status !== "draft") throw new Error(`RULE_NOT_DRAFT:${rule.status}`)

      const lockKey = advisoryLockKey(rule.country, rule.module)

      // 2. Acquérir le verrou advisory transactionnel
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`,
      )

      // 3. Vérifier l'absence de chevauchement avec les règles actives
      const overlaps = await tx
        .select({ id: fiscalRules.id })
        .from(fiscalRules)
        .where(
          and(
            eq(fiscalRules.country, rule.country),
            eq(fiscalRules.module, rule.module),
            eq(fiscalRules.status, "active"),
            ne(fiscalRules.id, rule.id),
            // Chevauchement : NOT (existante.effectiveTo <= nouvelle.effectiveFrom OR existante.effectiveFrom >= nouvelle.effectiveTo)
            // = les périodes se croisent
            or(
              // Existante sans fin : chevauche toujours si elle commence avant la fin de la nouvelle
              and(
                isNull(fiscalRules.effectiveTo),
                rule.effectiveTo
                  ? lt(fiscalRules.effectiveFrom, rule.effectiveTo)
                  : sql`TRUE`,
              ),
              // Existante avec fin : chevauche si debut_existante < fin_nouvelle ET fin_existante > debut_nouvelle
              and(
                gt(fiscalRules.effectiveTo, rule.effectiveFrom),
                rule.effectiveTo
                  ? lt(fiscalRules.effectiveFrom, rule.effectiveTo)
                  : sql`TRUE`,
              ),
            ),
          ),
        )
        .limit(1)

      if (overlaps.length > 0) {
        throw new Error(`FISCAL_RULE_OVERLAP:${overlaps[0].id}`)
      }

      // 4. Activer la règle
      const [activated] = await tx
        .update(fiscalRules)
        .set({
          status: "active",
          validationRef: input.validationRef,
          activatedBy: session.userId,
          activatedAt: new Date(),
        })
        .where(
          and(
            eq(fiscalRules.id, input.ruleId),
            eq(fiscalRules.status, "draft"),
          ),
        )
        .returning({ id: fiscalRules.id })

      if (!activated) throw new Error("ACTIVATION_FAILED")
      return { ruleId: activated.id }
    })

    return { ok: true, ruleId: result.ruleId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith("RULE_NOT_FOUND")) {
      return { ok: false, error: "Règle introuvable", code: "RULE_NOT_FOUND" }
    }
    if (msg.startsWith("RULE_NOT_DRAFT:")) {
      return {
        ok: false,
        error: `La règle n'est pas en statut draft (statut actuel : ${msg.split(":")[1]})`,
        code: "RULE_NOT_DRAFT",
      }
    }
    if (msg.startsWith("FISCAL_RULE_OVERLAP")) {
      return {
        ok: false,
        error: "Chevauchement détecté avec une règle active existante — corrigez la période.",
        code: "FISCAL_RULE_OVERLAP",
      }
    }
    return { ok: false, error: `Erreur interne: ${msg}`, code: "INTERNAL_ERROR" }
  }
}

/**
 * Désactive (ferme) une règle active (super_admin uniquement).
 * Passe la règle en statut 'closed'. Irréversible.
 */
export async function deactivateFiscalRule(
  ruleId: string,
): Promise<DeactivateFiscalRuleResult> {
  const session = await resolveSessionContext()
  if (!session.ok) return { ok: false, error: "Non authentifié", code: "UNAUTHENTICATED" }
  if (!session.isSuperAdmin) {
    return { ok: false, error: "Accès réservé au super admin", code: "FORBIDDEN" }
  }

  const [updated] = await getDb()
    .update(fiscalRules)
    .set({
      status: "closed",
      effectiveTo: new Date(),
    })
    .where(
      and(
        eq(fiscalRules.id, ruleId),
        eq(fiscalRules.status, "active"),
      ),
    )
    .returning({ id: fiscalRules.id })

  if (!updated) {
    return {
      ok: false,
      error: "Règle introuvable ou déjà fermée",
      code: "RULE_NOT_ACTIVE",
    }
  }

  return { ok: true, ruleId: updated.id }
}
