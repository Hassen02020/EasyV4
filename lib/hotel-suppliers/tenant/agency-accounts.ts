/**
 * PHASE 27 — Server Actions du portail Agence (`/pro/suppliers`). Scope
 * strictement à SA PROPRE agence — jamais de picker d'agence, jamais un
 * `agencyId` accepté depuis le client. Contrairement au Master Admin
 * (lib/hotel-suppliers/tenant/accounts.ts, super_admin, toutes agences),
 * une agence ne peut :
 *   - VOIR que ses propres comptes + les comptes partagés explicitement
 *     autorisés pour elle (RLS `hotel_supplier_accounts_select` s'en charge
 *     déjà — aucun filtre applicatif supplémentaire nécessaire ici) ;
 *   - CRÉER/MODIFIER/DÉSACTIVER/FAIRE TOURNER LES IDENTIFIANTS QUE de ses
 *     PROPRES comptes (jamais un compte partagé — RLS write policy le
 *     bloquerait de toute façon, mais on revérifie explicitement en
 *     applicatif pour ne jamais dépendre uniquement du silence de RLS) ;
 *   - JAMAIS autoriser une autre agence (réservé au Master Admin).
 *
 * `partner_owner` : lecture + écriture. `partner_agent` : lecture seule +
 * test de connexion (même logique que /pro/utilisateurs — la distinction
 * owner/agent est opérationnelle, jamais une partition de visibilité).
 */
"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentPartnerProfile } from "@/lib/auth/partner-profile"
import { withTenantContext, type TenantContext } from "@/lib/db/tenant-context"
import {
  hotelSuppliers,
  hotelSupplierAccounts,
  hotelSupplierCredentials,
} from "@/lib/db/schema"
import { encryptSecret, maskSecretForDisplay } from "@/lib/security/secret-crypto"
import { logSupplierAudit, assertNoSecretLeak } from "./audit"
import { resolveSupplierAccount } from "./resolver"
import { SUPPLIER_NAMES } from "../core/types"
import { logger } from "@/lib/logger"

export type AgencySupplierActionResult = { ok: true } | { ok: false; error: string }

interface AgencyActorContext {
  ctx: TenantContext & { agencyId: string }
  canManage: boolean
}

async function requireAgencyActorContext(): Promise<AgencyActorContext> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")

  const profile = await getCurrentPartnerProfile(user.id)
  if (!profile) throw new Error("FORBIDDEN")
  const isValidRole = profile.role === "partner_owner" || profile.role === "partner_agent" || profile.role === "super_admin"
  if (!isValidRole) throw new Error("FORBIDDEN")

  return {
    ctx: { agencyId: profile.agency.id, userId: profile.userId, isSuperAdmin: profile.role === "super_admin" },
    canManage: profile.role === "partner_owner" || profile.role === "super_admin",
  }
}

export interface AgencySupplierAccountRow {
  id: string
  supplierId: string
  supplierCode: string
  supplierName: string
  ownerType: string
  agencyId: string
  isOwnAccount: boolean
  displayName: string
  status: string
  mode: string
  priority: number
  lastTestedAt: Date | null
  lastTestStatus: string | null
  hasCredentials: boolean
  maskedSecret: string
}

/** RLS filtre déjà : comptes de sa propre agence + comptes partagés explicitement autorisés pour elle. Aucun filtre applicatif nécessaire. */
export async function listAgencyVisibleSupplierAccounts(): Promise<AgencySupplierAccountRow[]> {
  const { ctx } = await requireAgencyActorContext()
  return withTenantContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        account: hotelSupplierAccounts,
        supplierCode: hotelSuppliers.code,
        supplierName: hotelSuppliers.name,
      })
      .from(hotelSupplierAccounts)
      .innerJoin(hotelSuppliers, eq(hotelSuppliers.id, hotelSupplierAccounts.supplierId))
      .orderBy(hotelSupplierAccounts.priority)

    const credRows = await tx.select({ accountId: hotelSupplierCredentials.accountId }).from(hotelSupplierCredentials)
    const withCreds = new Set(credRows.map((r) => r.accountId))

    return rows.map((r) => ({
      id: r.account.id,
      supplierId: r.account.supplierId,
      supplierCode: r.supplierCode,
      supplierName: r.supplierName,
      ownerType: r.account.ownerType,
      agencyId: r.account.agencyId,
      isOwnAccount: r.account.agencyId === ctx.agencyId,
      displayName: r.account.displayName,
      status: r.account.status,
      mode: r.account.mode,
      priority: r.account.priority,
      lastTestedAt: r.account.lastTestedAt,
      lastTestStatus: r.account.lastTestStatus,
      hasCredentials: withCreds.has(r.account.id),
      maskedSecret: maskSecretForDisplay(),
    }))
  })
}

export async function listHotelSuppliersCatalogForAgency() {
  const { ctx } = await requireAgencyActorContext()
  return withTenantContext(ctx, (tx) => tx.select().from(hotelSuppliers).orderBy(hotelSuppliers.code))
}

export interface CreateOwnSupplierAccountInput {
  supplierId: string
  displayName: string
  mode: "live" | "virtual"
  priority: number
  login: string
  password: string
}

export async function createOwnSupplierAccount(input: CreateOwnSupplierAccountInput): Promise<AgencySupplierActionResult> {
  const { ctx, canManage } = await requireAgencyActorContext()
  if (!canManage) return { ok: false, error: "Réservé au propriétaire de l'agence." }
  try {
    if (!input.displayName.trim() || !input.login.trim() || !input.password.trim()) {
      return { ok: false, error: "Champs requis manquants (nom, login, mot de passe)." }
    }
    await withTenantContext(ctx, async (tx) => {
      const [account] = await tx
        .insert(hotelSupplierAccounts)
        .values({
          supplierId: input.supplierId,
          // Une agence ne peut créer QUE un compte "agency" pour elle-même —
          // jamais "master"/"whitelabel" (ces classifications restent
          // dérivées côté Master Admin selon le type réel de l'agence).
          ownerType: "agency",
          agencyId: ctx.agencyId,
          displayName: input.displayName.trim(),
          status: "active",
          mode: input.mode,
          priority: input.priority,
          createdByUserId: ctx.userId,
        })
        .returning({ id: hotelSupplierAccounts.id })
      const id = account!.id

      const cred = encryptSecret({ login: input.login.trim(), password: input.password })
      await tx.insert(hotelSupplierCredentials).values({
        accountId: id,
        agencyId: ctx.agencyId,
        ciphertext: cred.ciphertext,
        keyVersion: cred.keyVersion,
        updatedByUserId: ctx.userId,
      })

      const diff = { supplierId: input.supplierId, displayName: input.displayName, mode: input.mode }
      assertNoSecretLeak(diff)
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_ACCOUNT_CREATED", accountId: id, diff })
    })
    revalidatePath("/pro/suppliers")
    return { ok: true }
  } catch (err) {
    logger.error("[HotelSuppliers][Agency] Échec création compte", { code: err instanceof Error ? err.constructor.name : "unknown" })
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

async function assertOwnsAccount(ctx: TenantContext & { agencyId: string }, accountId: string): Promise<boolean> {
  return withTenantContext(ctx, async (tx) => {
    const [row] = await tx.select({ agencyId: hotelSupplierAccounts.agencyId }).from(hotelSupplierAccounts).where(eq(hotelSupplierAccounts.id, accountId))
    return !!row && row.agencyId === ctx.agencyId
  })
}

export async function rotateOwnSupplierCredentials(accountId: string, login: string, password: string): Promise<AgencySupplierActionResult> {
  const { ctx, canManage } = await requireAgencyActorContext()
  if (!canManage) return { ok: false, error: "Réservé au propriétaire de l'agence." }
  try {
    if (!login.trim() || !password.trim()) return { ok: false, error: "Login et mot de passe requis." }
    // Défense en profondeur : ne jamais dépendre uniquement du silence RLS
    // (une écriture hors scope affecterait 0 ligne, pas une erreur explicite).
    if (!(await assertOwnsAccount(ctx, accountId))) return { ok: false, error: "Ce compte ne vous appartient pas." }

    await withTenantContext(ctx, async (tx) => {
      const cred = encryptSecret({ login: login.trim(), password })
      const existing = await tx.select({ id: hotelSupplierCredentials.id }).from(hotelSupplierCredentials).where(eq(hotelSupplierCredentials.accountId, accountId))
      if (existing.length > 0) {
        await tx
          .update(hotelSupplierCredentials)
          .set({ ciphertext: cred.ciphertext, keyVersion: cred.keyVersion, updatedByUserId: ctx.userId, updatedAt: new Date() })
          .where(eq(hotelSupplierCredentials.accountId, accountId))
      } else {
        await tx.insert(hotelSupplierCredentials).values({ accountId, agencyId: ctx.agencyId, ciphertext: cred.ciphertext, keyVersion: cred.keyVersion, updatedByUserId: ctx.userId })
      }
      await tx.update(hotelSupplierAccounts).set({ status: "active", updatedAt: new Date() }).where(eq(hotelSupplierAccounts.id, accountId))
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_CREDENTIALS_ROTATED", accountId, diff: { rotated: true } })
    })
    revalidatePath("/pro/suppliers")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

export async function setOwnSupplierAccountStatus(accountId: string, status: "active" | "disabled"): Promise<AgencySupplierActionResult> {
  const { ctx, canManage } = await requireAgencyActorContext()
  if (!canManage) return { ok: false, error: "Réservé au propriétaire de l'agence." }
  try {
    if (!(await assertOwnsAccount(ctx, accountId))) return { ok: false, error: "Ce compte ne vous appartient pas." }
    await withTenantContext(ctx, async (tx) => {
      await tx.update(hotelSupplierAccounts).set({ status, updatedAt: new Date() }).where(eq(hotelSupplierAccounts.id, accountId))
      await logSupplierAudit(tx, {
        agencyId: ctx.agencyId,
        actorUserId: ctx.userId,
        action: status === "active" ? "SUPPLIER_ENABLED" : "SUPPLIER_DISABLED",
        accountId,
        diff: { status },
      })
    })
    revalidatePath("/pro/suppliers")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

export async function updateOwnSupplierAccountPriority(accountId: string, priority: number): Promise<AgencySupplierActionResult> {
  const { ctx, canManage } = await requireAgencyActorContext()
  if (!canManage) return { ok: false, error: "Réservé au propriétaire de l'agence." }
  try {
    // La priorité peut être réglée par l'agence même sur un compte MASTER
    // partagé qu'elle utilise (ordre d'essai propre à SON contexte de
    // résolution) — mais le champ `priority` est stocké sur la ligne
    // `hotel_supplier_accounts` elle-même, partagée par tous les
    // utilisateurs de ce compte. Pour rester honnête et ne jamais modifier
    // un compte qui ne lui appartient pas (RLS l'empêcherait de toute façon —
    // write policy = agency_id = current_agency_id()), cette action reste
    // limitée aux comptes propres, comme les autres actions d'écriture.
    if (!(await assertOwnsAccount(ctx, accountId))) return { ok: false, error: "Ce compte ne vous appartient pas." }
    await withTenantContext(ctx, async (tx) => {
      await tx.update(hotelSupplierAccounts).set({ priority, updatedAt: new Date() }).where(eq(hotelSupplierAccounts.id, accountId))
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_ACCOUNT_UPDATED", accountId, diff: { priority } })
    })
    revalidatePath("/pro/suppliers")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

/** Même opération de test que le Master Admin (lecture pure `listCities`) — disponible en lecture pour owner ET agent. */
export async function testOwnSupplierConnection(accountId: string): Promise<AgencySupplierActionResult> {
  const { ctx } = await requireAgencyActorContext()
  try {
    const [accountRow] = await withTenantContext(ctx, (tx) =>
      tx
        .select({ supplierCode: hotelSuppliers.code })
        .from(hotelSupplierAccounts)
        .innerJoin(hotelSuppliers, eq(hotelSuppliers.id, hotelSupplierAccounts.supplierId))
        .where(eq(hotelSupplierAccounts.id, accountId)),
    )
    if (!accountRow) return { ok: false, error: "Compte introuvable ou inaccessible." }
    if (!(SUPPLIER_NAMES as readonly string[]).includes(accountRow.supplierCode)) {
      return { ok: false, error: `Fournisseur non pris en charge par le Hub: ${accountRow.supplierCode}` }
    }

    const resolved = await resolveSupplierAccount({
      supplierCode: accountRow.supplierCode as (typeof SUPPLIER_NAMES)[number],
      tenantContext: ctx,
      requestedAccountId: accountId,
    })
    if (!resolved.ok) return { ok: false, error: resolved.message }

    let testOk = false
    let errorCode: string | undefined
    if (accountRow.supplierCode === "mygo") {
      try {
        const { buildMyGoConfigFromAccount } = await import("../mygo/account-config")
        const { createMyGoClientForAccount } = await import("@/lib/mygo/client")
        await createMyGoClientForAccount(accountId, buildMyGoConfigFromAccount(resolved.account)).listCities()
        testOk = true
      } catch (err) {
        errorCode = err instanceof Error ? err.constructor.name : "UNKNOWN"
      }
    } else {
      errorCode = "SUPPLIER_NOT_TESTABLE"
    }

    await withTenantContext(ctx, async (tx) => {
      await tx
        .update(hotelSupplierAccounts)
        .set({
          lastTestedAt: new Date(),
          lastTestStatus: testOk ? "success" : "failure",
          lastTestErrorCode: errorCode ?? null,
          ...(!testOk ? { status: "invalid_credentials" as const } : {}),
        })
        .where(eq(hotelSupplierAccounts.id, accountId))
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_CONNECTION_TESTED", accountId, diff: { status: testOk ? "success" : "failure", errorCode } })
    })
    revalidatePath("/pro/suppliers")
    return testOk ? { ok: true } : { ok: false, error: errorCode ?? "Échec du test de connexion." }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}
