"use server"

import { withSystemContext } from "@/lib/db/tenant-context"
import { suppliers } from "@/lib/db/schema"
import { asc } from "drizzle-orm"
import type { Supplier } from "@/lib/db/schema"

export type SupplierRow = Pick<
  Supplier,
  | "id"
  | "name"
  | "type"
  | "status"
  | "connectivityLevel"
  | "certificationStatus"
  | "lastSyncAt"
  | "autoSync"
  | "website"
  | "supportEmail"
  | "createdAt"
>

export async function listSuppliers(): Promise<SupplierRow[]> {
  return withSystemContext((db) =>
    db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        type: suppliers.type,
        status: suppliers.status,
        connectivityLevel: suppliers.connectivityLevel,
        certificationStatus: suppliers.certificationStatus,
        lastSyncAt: suppliers.lastSyncAt,
        autoSync: suppliers.autoSync,
        website: suppliers.website,
        supportEmail: suppliers.supportEmail,
        createdAt: suppliers.createdAt,
      })
      .from(suppliers)
      .orderBy(asc(suppliers.name)),
  )
}
