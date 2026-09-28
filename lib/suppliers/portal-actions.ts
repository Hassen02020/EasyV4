"use server"

import { withSystemContext } from "@/lib/db/tenant-context"
import { supplierNodes, supplierPortalUsers } from "@/lib/db/schema"
import { eq, desc, asc } from "drizzle-orm"
import type { SupplierNode, NewSupplierNode, SupplierOnboardingStatus } from "@/lib/db/schema"

/* -------------------------------------------------------------------------- */
/* Read                                                                        */
/* -------------------------------------------------------------------------- */

export type SupplierNodeRow = Pick<
  SupplierNode,
  | "id"
  | "supplierId"
  | "slug"
  | "displayName"
  | "shortDescription"
  | "contactEmail"
  | "contactCountry"
  | "modules"
  | "onboardingStatus"
  | "portalEnabled"
  | "logoUrl"
  | "invitedByUserId"
  | "activatedAt"
  | "createdAt"
>

export async function listSupplierNodes(): Promise<SupplierNodeRow[]> {
  return withSystemContext((db) =>
    db
      .select({
        id: supplierNodes.id,
        supplierId: supplierNodes.supplierId,
        slug: supplierNodes.slug,
        displayName: supplierNodes.displayName,
        shortDescription: supplierNodes.shortDescription,
        contactEmail: supplierNodes.contactEmail,
        contactCountry: supplierNodes.contactCountry,
        modules: supplierNodes.modules,
        onboardingStatus: supplierNodes.onboardingStatus,
        portalEnabled: supplierNodes.portalEnabled,
        logoUrl: supplierNodes.logoUrl,
        invitedByUserId: supplierNodes.invitedByUserId,
        activatedAt: supplierNodes.activatedAt,
        createdAt: supplierNodes.createdAt,
      })
      .from(supplierNodes)
      .orderBy(asc(supplierNodes.displayName)),
  )
}

export async function getSupplierNodeBySlug(slug: string): Promise<SupplierNode | null> {
  const rows = await withSystemContext((db) =>
    db.select().from(supplierNodes).where(eq(supplierNodes.slug, slug)).limit(1),
  )
  return rows[0] ?? null
}

export async function getSupplierNodeBySupplierId(supplierId: string): Promise<SupplierNode | null> {
  const rows = await withSystemContext((db) =>
    db.select().from(supplierNodes).where(eq(supplierNodes.supplierId, supplierId)).limit(1),
  )
  return rows[0] ?? null
}

/* -------------------------------------------------------------------------- */
/* Write                                                                       */
/* -------------------------------------------------------------------------- */

export async function createSupplierNode(
  data: Omit<NewSupplierNode, "id" | "createdAt" | "updatedAt">,
): Promise<SupplierNode> {
  const rows = await withSystemContext((db) =>
    db.insert(supplierNodes).values(data).returning(),
  )
  if (!rows[0]) throw new Error("createSupplierNode: insert returned no row")
  return rows[0]
}

export async function updateSupplierNodeStatus(
  nodeId: string,
  status: SupplierOnboardingStatus,
  portalEnabled?: boolean,
): Promise<void> {
  const patch: Partial<NewSupplierNode> = {
    onboardingStatus: status,
    updatedAt: new Date(),
  }
  if (status === "active") {
    patch.activatedAt = new Date()
    patch.portalEnabled = portalEnabled ?? true
  }
  if (portalEnabled !== undefined) {
    patch.portalEnabled = portalEnabled
  }
  await withSystemContext((db) =>
    db.update(supplierNodes).set(patch).where(eq(supplierNodes.id, nodeId)),
  )
}

/* -------------------------------------------------------------------------- */
/* Portal users                                                                */
/* -------------------------------------------------------------------------- */

export async function listPortalUsersForNode(nodeId: string) {
  return withSystemContext((db) =>
    db
      .select()
      .from(supplierPortalUsers)
      .where(eq(supplierPortalUsers.supplierNodeId, nodeId))
      .orderBy(asc(supplierPortalUsers.role), desc(supplierPortalUsers.invitedAt)),
  )
}
