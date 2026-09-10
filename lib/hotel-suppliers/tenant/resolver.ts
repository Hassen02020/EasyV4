/**
 * PHASE 27 — Résolveur unique de compte fournisseur multi-tenant.
 *
 * SEUL point d'entrée légitime pour transformer (fournisseur, tenant) en
 * identifiants déchiffrés utilisables — jamais un driver, jamais une Server
 * Action, jamais l'UI ne doit lire `hotel_supplier_credentials` directement.
 *
 * Ordre de résolution (mission Phase 27) :
 *   1. `requestedAccountId` explicite — résout STRICTEMENT ce compte ou
 *      échoue (jamais de repli silencieux vers un autre compte : un appelant
 *      qui demande un compte précis a une raison de le faire).
 *   2. Comptes possédés par l'agence du tenant (priority ASC, défaut d'abord).
 *   3. Comptes partagés EXPLICITEMENT autorisés pour cette agence (inclut les
 *      comptes MASTER — un compte MASTER n'est JAMAIS utilisable implicitement
 *      par une agence, uniquement via une ligne `hotel_supplier_authorizations`
 *      explicite, jamais "s'il existe globalement, tout le monde peut l'utiliser").
 *   4. Sinon NOT_CONFIGURED — jamais de credentials inventés.
 *
 * RLS (`hotel_supplier_credentials`) refuse délibérément tout accès via
 * autorisation partagée (voir 0035_hotel_supplier_control_plane.sql) — pour
 * un compte partagé non possédé par le tenant, ce module doit repasser par
 * `withSystemContext` APRÈS avoir revérifié explicitement l'autorisation
 * (défense en profondeur : ne fait jamais confiance à un SELECT amont pour
 * ce contrôle précis — c'est le test "resolver cannot be bypassed by
 * user-supplied accountId").
 */
import { and, asc, desc, eq } from "drizzle-orm"
import {
  hotelSuppliers,
  hotelSupplierAccounts,
  hotelSupplierAuthorizations,
  hotelSupplierCredentials,
  type HotelSupplierAccountRow,
} from "@/lib/db/schema"
import { withTenantContext, withSystemContext, type TenantContext } from "@/lib/db/tenant-context"
import type { DrizzleTransaction } from "@/lib/db/client"
import { decryptSecret } from "@/lib/security/secret-crypto"
import type {
  ResolveSupplierAccountParams,
  ResolveSupplierAccountResult,
  ResolvedSupplierAccount,
} from "./types"
import type { SupplierName } from "../core/types"

async function findSupplierRow(supplierCode: SupplierName) {
  return withSystemContext(async (tx: DrizzleTransaction) => {
    const [row] = await tx.select().from(hotelSuppliers).where(eq(hotelSuppliers.code, supplierCode))
    return row ?? null
  })
}

function toResolved(
  row: HotelSupplierAccountRow,
  supplierCode: SupplierName,
  credentials: Record<string, unknown>,
): ResolvedSupplierAccount {
  return {
    accountId: row.id,
    supplierId: row.supplierId,
    supplierCode,
    ownerType: row.ownerType,
    ownerAgencyId: row.agencyId,
    mode: row.mode,
    timeoutMs: row.timeoutMs,
    priority: row.priority,
    credentials,
  }
}

/**
 * Déchiffre les identifiants d'un compte pour LE tenant courant.
 * - Compte possédé (`ownerAgencyId === tenantContext.agencyId`) : lu sous le
 *   contexte tenant normal — RLS autorise (agency_id = current_agency_id()).
 * - Compte partagé : revérifie l'autorisation EXPLICITEMENT, puis déchiffre
 *   sous contexte système privilégié — jamais sous le contexte tenant de
 *   l'agence autorisée (qui ne peut structurellement pas lire cette table).
 * Renvoie `null` (jamais une exception) si l'accès n'est pas légitime — un
 * appelant ne doit jamais pouvoir distinguer "compte introuvable" de "accès
 * refusé" à partir de ce module.
 */
async function decryptAccountCredentials(
  accountId: string,
  ownerAgencyId: string,
  tenantContext: TenantContext,
): Promise<Record<string, unknown> | null> {
  if (tenantContext.agencyId && tenantContext.agencyId === ownerAgencyId) {
    return withTenantContext(tenantContext, async (tx) => {
      const [row] = await tx
        .select()
        .from(hotelSupplierCredentials)
        .where(eq(hotelSupplierCredentials.accountId, accountId))
      if (!row) return null
      try {
        return decryptSecret<Record<string, unknown>>(row.ciphertext)
      } catch {
        return null
      }
    })
  }

  if (tenantContext.isSuperAdmin) {
    return withSystemContext(async (tx) => {
      const [row] = await tx
        .select()
        .from(hotelSupplierCredentials)
        .where(eq(hotelSupplierCredentials.accountId, accountId))
      if (!row) return null
      try {
        return decryptSecret<Record<string, unknown>>(row.ciphertext)
      } catch {
        return null
      }
    })
  }

  if (!tenantContext.agencyId) return null

  const authorizedAgencyId = tenantContext.agencyId
  return withSystemContext(async (tx) => {
    const [authRow] = await tx
      .select({ id: hotelSupplierAuthorizations.id })
      .from(hotelSupplierAuthorizations)
      .where(
        and(
          eq(hotelSupplierAuthorizations.accountId, accountId),
          eq(hotelSupplierAuthorizations.authorizedAgencyId, authorizedAgencyId),
        ),
      )
    if (!authRow) return null
    const [credRow] = await tx
      .select()
      .from(hotelSupplierCredentials)
      .where(eq(hotelSupplierCredentials.accountId, accountId))
    if (!credRow) return null
    try {
      return decryptSecret<Record<string, unknown>>(credRow.ciphertext)
    } catch {
      return null
    }
  })
}

export async function resolveSupplierAccount(
  params: ResolveSupplierAccountParams,
): Promise<ResolveSupplierAccountResult> {
  const { supplierCode, tenantContext, requestedAccountId } = params

  const supplierRow = await findSupplierRow(supplierCode)
  if (!supplierRow) {
    return { ok: false, reason: "SUPPLIER_UNKNOWN", message: `Fournisseur inconnu: ${supplierCode}` }
  }

  if (requestedAccountId) {
    // Visible seulement si RLS l'autorise pour CE tenant (propre agence, autorisé, ou super_admin) — jamais un compte d'un autre tenant.
    const row = await withTenantContext(tenantContext, async (tx) => {
      const [r] = await tx
        .select()
        .from(hotelSupplierAccounts)
        .where(eq(hotelSupplierAccounts.id, requestedAccountId))
      return r ?? null
    })
    if (!row || row.supplierId !== supplierRow.id) {
      return { ok: false, reason: "ACCOUNT_NOT_FOUND", message: "Compte fournisseur introuvable ou inaccessible pour ce tenant." }
    }
    if (row.status !== "active") {
      return { ok: false, reason: "ACCOUNT_DISABLED", message: `Compte fournisseur non actif (statut: ${row.status}).` }
    }
    const credentials = await decryptAccountCredentials(row.id, row.agencyId, tenantContext)
    if (!credentials) {
      return { ok: false, reason: "CREDENTIALS_MISSING", message: "Identifiants introuvables ou accès refusé pour ce compte." }
    }
    return { ok: true, account: toResolved(row, supplierCode, credentials) }
  }

  if (!tenantContext.agencyId) {
    return { ok: false, reason: "NOT_CONFIGURED", message: "Aucun contexte agence — impossible de résoudre un compte par défaut." }
  }
  const agencyId = tenantContext.agencyId

  const ownAccounts = await withTenantContext(tenantContext, async (tx) => {
    return tx
      .select()
      .from(hotelSupplierAccounts)
      .where(
        and(
          eq(hotelSupplierAccounts.supplierId, supplierRow.id),
          eq(hotelSupplierAccounts.agencyId, agencyId),
          eq(hotelSupplierAccounts.status, "active"),
        ),
      )
      .orderBy(desc(hotelSupplierAccounts.isDefault), asc(hotelSupplierAccounts.priority))
  })
  const own = ownAccounts[0]
  if (own) {
    const credentials = await decryptAccountCredentials(own.id, own.agencyId, tenantContext)
    if (credentials) return { ok: true, account: toResolved(own, supplierCode, credentials) }
  }

  // Comptes partagés EXPLICITEMENT autorisés pour cette agence (inclut les comptes MASTER — jamais implicite).
  const sharedRows = await withTenantContext(tenantContext, async (tx) => {
    return tx
      .select({ account: hotelSupplierAccounts })
      .from(hotelSupplierAuthorizations)
      .innerJoin(hotelSupplierAccounts, eq(hotelSupplierAccounts.id, hotelSupplierAuthorizations.accountId))
      .where(
        and(
          eq(hotelSupplierAuthorizations.authorizedAgencyId, agencyId),
          eq(hotelSupplierAccounts.supplierId, supplierRow.id),
          eq(hotelSupplierAccounts.status, "active"),
        ),
      )
      .orderBy(asc(hotelSupplierAccounts.priority))
  })
  for (const { account } of sharedRows) {
    const credentials = await decryptAccountCredentials(account.id, account.agencyId, tenantContext)
    if (credentials) return { ok: true, account: toResolved(account, supplierCode, credentials) }
  }

  return { ok: false, reason: "NOT_CONFIGURED", message: `Aucun compte ${supplierCode} actif/configuré pour ce tenant.` }
}
