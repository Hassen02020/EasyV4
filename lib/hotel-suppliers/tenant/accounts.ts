/**
 * PHASE 27 — Server Actions du Master Admin Control Plane
 * (`/admin/suppliers`). Seul point d'entrée UI pour créer/modifier des
 * comptes fournisseur, faire tourner/révoquer une autorisation partagée, et
 * tester une connexion — jamais un accès direct à `hotel_supplier_*` depuis
 * un composant. Toute action sensible écrit une ligne `audit_events`
 * (voir ./audit.ts) — jamais le secret lui-même.
 */
"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { createServerSupabase } from "@/lib/supabase/server"
import { getCurrentAdminProfile } from "@/lib/auth/profile"
import { getDefaultAgencyId } from "@/lib/agencies/default-agency"
import { withTenantContext, type TenantContext } from "@/lib/db/tenant-context"
import {
  agencies,
  hotelSuppliers,
  hotelSupplierAccounts,
  hotelSupplierAuthorizations,
  hotelSupplierCredentials,
} from "@/lib/db/schema"
import { encryptSecret, maskSecretForDisplay } from "@/lib/security/secret-crypto"
import { logSupplierAudit, assertNoSecretLeak } from "./audit"
import { resolveSupplierAccount } from "./resolver"
import { SUPPLIER_NAMES, type SupplierName } from "../core/types"
import { logger } from "@/lib/logger"

export type SupplierAccountActionResult = { ok: true } | { ok: false; error: string }

async function requireSuperAdminContext(): Promise<TenantContext & { agencyId: string }> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("NOT_AUTHENTICATED")
  const profile = await getCurrentAdminProfile(user.id)
  if (profile?.role !== "super_admin") throw new Error("FORBIDDEN")
  const agencyId = profile.agencyId ?? (await getDefaultAgencyId())
  if (!agencyId) throw new Error("NO_MASTER_AGENCY")
  return { agencyId, userId: user.id, isSuperAdmin: true }
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export async function listHotelSuppliersCatalog() {
  const ctx = await requireSuperAdminContext()
  return withTenantContext(ctx, (tx) => tx.select().from(hotelSuppliers).orderBy(hotelSuppliers.code))
}

export async function listAgenciesForPicker() {
  const ctx = await requireSuperAdminContext()
  return withTenantContext(ctx, (tx) =>
    tx
      .select({ id: agencies.id, name: agencies.name, agencyType: agencies.agencyType, domain: agencies.domain })
      .from(agencies)
      .orderBy(agencies.name),
  )
}

export interface AdminSupplierAccountRow {
  id: string
  supplierId: string
  supplierCode: string
  supplierName: string
  ownerType: string
  agencyId: string
  agencyName: string
  displayName: string
  status: string
  mode: string
  priority: number
  timeoutMs: number | null
  isDefault: boolean
  lastTestedAt: Date | null
  lastTestStatus: string | null
  lastTestErrorCode: string | null
  hasCredentials: boolean
  maskedSecret: string
  authorizedAgencyCount: number
}

/** Vue complète pour le Master Admin — TOUS les comptes de TOUTES les agences (super_admin voit tout par RLS). Jamais de credentials en clair. */
export async function listAllSupplierAccounts(): Promise<AdminSupplierAccountRow[]> {
  const ctx = await requireSuperAdminContext()
  return withTenantContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        account: hotelSupplierAccounts,
        supplierCode: hotelSuppliers.code,
        supplierName: hotelSuppliers.name,
        agencyName: agencies.name,
      })
      .from(hotelSupplierAccounts)
      .innerJoin(hotelSuppliers, eq(hotelSuppliers.id, hotelSupplierAccounts.supplierId))
      .innerJoin(agencies, eq(agencies.id, hotelSupplierAccounts.agencyId))
      .orderBy(desc(hotelSupplierAccounts.createdAt))

    const credRows = await tx.select({ accountId: hotelSupplierCredentials.accountId }).from(hotelSupplierCredentials)
    const withCreds = new Set(credRows.map((r) => r.accountId))

    const authRows = await tx.select({ accountId: hotelSupplierAuthorizations.accountId }).from(hotelSupplierAuthorizations)
    const authCounts = new Map<string, number>()
    for (const r of authRows) authCounts.set(r.accountId, (authCounts.get(r.accountId) ?? 0) + 1)

    return rows.map((r) => ({
      id: r.account.id,
      supplierId: r.account.supplierId,
      supplierCode: r.supplierCode,
      supplierName: r.supplierName,
      ownerType: r.account.ownerType,
      agencyId: r.account.agencyId,
      agencyName: r.agencyName,
      displayName: r.account.displayName,
      status: r.account.status,
      mode: r.account.mode,
      priority: r.account.priority,
      timeoutMs: r.account.timeoutMs,
      isDefault: r.account.isDefault,
      lastTestedAt: r.account.lastTestedAt,
      lastTestStatus: r.account.lastTestStatus,
      lastTestErrorCode: r.account.lastTestErrorCode,
      hasCredentials: withCreds.has(r.account.id),
      maskedSecret: maskSecretForDisplay(),
      authorizedAgencyCount: authCounts.get(r.account.id) ?? 0,
    }))
  })
}

export async function listAuthorizationsForAccount(accountId: string) {
  const ctx = await requireSuperAdminContext()
  return withTenantContext(ctx, (tx) =>
    tx
      .select({ id: hotelSupplierAuthorizations.id, agencyId: agencies.id, agencyName: agencies.name })
      .from(hotelSupplierAuthorizations)
      .innerJoin(agencies, eq(agencies.id, hotelSupplierAuthorizations.authorizedAgencyId))
      .where(eq(hotelSupplierAuthorizations.accountId, accountId)),
  )
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

function deriveOwnerType(agencyType: string, domain: string | null): "master" | "agency" | "whitelabel" {
  if (agencyType !== "ota") return "agency"
  return domain ? "whitelabel" : "master"
}

export interface CreateSupplierAccountInput {
  supplierId: string
  ownerAgencyId: string
  displayName: string
  mode: "live" | "virtual"
  priority: number
  timeoutMs?: number
  login: string
  password: string
}

export async function createSupplierAccount(input: CreateSupplierAccountInput): Promise<SupplierAccountActionResult> {
  const ctx = await requireSuperAdminContext()
  try {
    if (!input.displayName.trim() || !input.login.trim() || !input.password.trim()) {
      return { ok: false, error: "Champs requis manquants (nom, login, mot de passe)." }
    }
    const accountId = await withTenantContext(ctx, async (tx) => {
      const [ownerAgency] = await tx
        .select({ agencyType: agencies.agencyType, domain: agencies.domain })
        .from(agencies)
        .where(eq(agencies.id, input.ownerAgencyId))
      if (!ownerAgency) throw new Error("AGENCY_NOT_FOUND")
      const ownerType = deriveOwnerType(ownerAgency.agencyType, ownerAgency.domain)

      const [account] = await tx
        .insert(hotelSupplierAccounts)
        .values({
          supplierId: input.supplierId,
          ownerType,
          agencyId: input.ownerAgencyId,
          displayName: input.displayName.trim(),
          status: "active",
          mode: input.mode,
          priority: input.priority,
          timeoutMs: input.timeoutMs ?? null,
          createdByUserId: ctx.userId,
        })
        .returning({ id: hotelSupplierAccounts.id })
      const id = account!.id

      const cred = encryptSecret({ login: input.login.trim(), password: input.password })
      await tx.insert(hotelSupplierCredentials).values({
        accountId: id,
        agencyId: input.ownerAgencyId,
        ciphertext: cred.ciphertext,
        keyVersion: cred.keyVersion,
        updatedByUserId: ctx.userId,
      })

      const diff = { supplierId: input.supplierId, ownerType, agencyId: input.ownerAgencyId, displayName: input.displayName, mode: input.mode }
      assertNoSecretLeak(diff)
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_ACCOUNT_CREATED", accountId: id, diff })
      return id
    })
    logger.info("[HotelSuppliers] Compte fournisseur créé", { accountId, supplierId: input.supplierId })
    revalidatePath("/admin/suppliers")
    return { ok: true }
  } catch (err) {
    logger.error("[HotelSuppliers] Échec création compte", { code: err instanceof Error ? err.constructor.name : "unknown" })
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

export interface UpdateSupplierAccountInput {
  accountId: string
  displayName?: string
  priority?: number
  timeoutMs?: number | null
  isDefault?: boolean
}

export async function updateSupplierAccount(input: UpdateSupplierAccountInput): Promise<SupplierAccountActionResult> {
  const ctx = await requireSuperAdminContext()
  try {
    await withTenantContext(ctx, async (tx) => {
      const patch: Record<string, unknown> = { updatedAt: new Date() }
      if (input.displayName !== undefined) patch.displayName = input.displayName.trim()
      if (input.priority !== undefined) patch.priority = input.priority
      if (input.timeoutMs !== undefined) patch.timeoutMs = input.timeoutMs
      if (input.isDefault !== undefined) patch.isDefault = input.isDefault

      await tx.update(hotelSupplierAccounts).set(patch).where(eq(hotelSupplierAccounts.id, input.accountId))
      const diff = { ...patch, updatedAt: undefined }
      assertNoSecretLeak(diff)
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_ACCOUNT_UPDATED", accountId: input.accountId, diff })
    })
    revalidatePath("/admin/suppliers")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

export async function setSupplierAccountStatus(accountId: string, status: "active" | "disabled"): Promise<SupplierAccountActionResult> {
  const ctx = await requireSuperAdminContext()
  try {
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
    revalidatePath("/admin/suppliers")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

export async function rotateSupplierCredentials(accountId: string, login: string, password: string): Promise<SupplierAccountActionResult> {
  const ctx = await requireSuperAdminContext()
  try {
    if (!login.trim() || !password.trim()) return { ok: false, error: "Login et mot de passe requis." }
    await withTenantContext(ctx, async (tx) => {
      const [account] = await tx.select({ agencyId: hotelSupplierAccounts.agencyId }).from(hotelSupplierAccounts).where(eq(hotelSupplierAccounts.id, accountId))
      if (!account) throw new Error("ACCOUNT_NOT_FOUND")
      const cred = encryptSecret({ login: login.trim(), password })
      const existing = await tx.select({ id: hotelSupplierCredentials.id }).from(hotelSupplierCredentials).where(eq(hotelSupplierCredentials.accountId, accountId))
      if (existing.length > 0) {
        await tx
          .update(hotelSupplierCredentials)
          .set({ ciphertext: cred.ciphertext, keyVersion: cred.keyVersion, updatedByUserId: ctx.userId, updatedAt: new Date() })
          .where(eq(hotelSupplierCredentials.accountId, accountId))
      } else {
        await tx.insert(hotelSupplierCredentials).values({
          accountId,
          agencyId: account.agencyId,
          ciphertext: cred.ciphertext,
          keyVersion: cred.keyVersion,
          updatedByUserId: ctx.userId,
        })
      }
      // Une rotation de credentials invalide tout statut "invalid_credentials"/"error" précédent — à re-vérifier via testSupplierConnection.
      await tx.update(hotelSupplierAccounts).set({ status: "active", updatedAt: new Date() }).where(eq(hotelSupplierAccounts.id, accountId))
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_CREDENTIALS_ROTATED", accountId, diff: { rotated: true } })
    })
    revalidatePath("/admin/suppliers")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

export async function authorizeAgencyForAccount(accountId: string, authorizedAgencyId: string): Promise<SupplierAccountActionResult> {
  const ctx = await requireSuperAdminContext()
  try {
    await withTenantContext(ctx, async (tx) => {
      const [existing] = await tx
        .select({ id: hotelSupplierAuthorizations.id })
        .from(hotelSupplierAuthorizations)
        .where(and(eq(hotelSupplierAuthorizations.accountId, accountId), eq(hotelSupplierAuthorizations.authorizedAgencyId, authorizedAgencyId)))
      if (existing) return
      await tx.insert(hotelSupplierAuthorizations).values({ accountId, authorizedAgencyId, authorizedByUserId: ctx.userId })
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_AUTHORIZED", accountId, diff: { authorizedAgencyId } })
    })
    revalidatePath("/admin/suppliers")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

export async function revokeAgencyAuthorization(accountId: string, authorizedAgencyId: string): Promise<SupplierAccountActionResult> {
  const ctx = await requireSuperAdminContext()
  try {
    await withTenantContext(ctx, async (tx) => {
      await tx
        .delete(hotelSupplierAuthorizations)
        .where(and(eq(hotelSupplierAuthorizations.accountId, accountId), eq(hotelSupplierAuthorizations.authorizedAgencyId, authorizedAgencyId)))
      await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_UNAUTHORIZED", accountId, diff: { authorizedAgencyId } })
    })
    revalidatePath("/admin/suppliers")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

/**
 * Teste une connexion via l'opération EXISTANTE la plus sûre du driver
 * concerné — jamais un endpoint inventé. Pour myGo : `listCities()` (lecture
 * pure, déjà utilisée en production, aucun effet de bord). Les autres
 * fournisseurs sont `NOT_CONFIGURED` (Phase 26/27) — jamais simulé.
 */
export async function testSupplierConnection(accountId: string): Promise<SupplierAccountActionResult> {
  const ctx = await requireSuperAdminContext()
  const startedAt = Date.now()
  try {
    const [accountRow] = await withTenantContext(ctx, (tx) =>
      tx
        .select({ supplierCode: hotelSuppliers.code })
        .from(hotelSupplierAccounts)
        .innerJoin(hotelSuppliers, eq(hotelSuppliers.id, hotelSupplierAccounts.supplierId))
        .where(eq(hotelSupplierAccounts.id, accountId)),
    )
    if (!accountRow) return { ok: false, error: "Compte introuvable." }
    if (!(SUPPLIER_NAMES as readonly string[]).includes(accountRow.supplierCode)) {
      return { ok: false, error: `Code fournisseur inconnu du Hub: ${accountRow.supplierCode}` }
    }
    const supplierCode = accountRow.supplierCode as SupplierName

    const resolved = await resolveSupplierAccount({ supplierCode, tenantContext: ctx, requestedAccountId: accountId })
    if (!resolved.ok) {
      await recordTestResult(ctx, accountId, "error", resolved.reason)
      return { ok: false, error: resolved.message }
    }

    let testOk = false
    let errorCode: string | undefined
    if (accountRow.supplierCode === "mygo") {
      try {
        const { buildMyGoConfigFromAccount } = await import("../mygo/account-config")
        const { createMyGoClientForAccount } = await import("@/lib/mygo/client")
        const client = createMyGoClientForAccount(accountId, buildMyGoConfigFromAccount(resolved.account))
        // `listCities` : lecture pure statique déjà utilisée en production
        // (aucun effet de bord), authentifiée avec les mêmes Credential que
        // tout autre appel — un login/mot de passe invalide y échoue
        // exactement comme il échouerait sur n'importe quel autre endpoint,
        // sans jamais inventer une opération dédiée au "test".
        await client.listCities()
        testOk = true
      } catch (err) {
        errorCode = err instanceof Error ? err.constructor.name : "UNKNOWN"
        testOk = false
      }
    } else {
      errorCode = "SUPPLIER_NOT_TESTABLE"
    }

    const elapsedMs = Date.now() - startedAt
    await recordTestResult(ctx, accountId, testOk ? "success" : "failure", errorCode)
    logger.info("[HotelSuppliers] Test de connexion", { accountId, supplierCode: accountRow.supplierCode, ok: testOk, elapsedMs })
    revalidatePath("/admin/suppliers")
    return testOk ? { ok: true } : { ok: false, error: errorCode ?? "Échec du test de connexion." }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur inconnue" }
  }
}

async function recordTestResult(ctx: TenantContext & { agencyId: string }, accountId: string, status: "success" | "failure" | "error", errorCode?: string) {
  await withTenantContext(ctx, async (tx) => {
    await tx
      .update(hotelSupplierAccounts)
      .set({
        lastTestedAt: new Date(),
        lastTestStatus: status,
        lastTestErrorCode: errorCode ?? null,
        ...(status === "failure" ? { status: "invalid_credentials" as const } : {}),
      })
      .where(eq(hotelSupplierAccounts.id, accountId))
    await logSupplierAudit(tx, { agencyId: ctx.agencyId, actorUserId: ctx.userId, action: "SUPPLIER_CONNECTION_TESTED", accountId, diff: { status, errorCode } })
  })
}
