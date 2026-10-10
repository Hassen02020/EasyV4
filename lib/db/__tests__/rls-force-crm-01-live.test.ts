/**
 * RLS-FORCE-CRM-01 — structural proof against a real Postgres database.
 *
 * The six CRM tables already had tenant-isolation policies, but ordinary
 * RLS does not constrain the table owner. This regression test proves that
 * both RLS and FORCE RLS are enabled on every table in scope.
 *
 * 0130 (RLS-CONSENT-FIX, 2026-10-10): lead_consent_events added — it had
 * ENABLE but not FORCE. Now aligned with the other 13 CRM tables.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { sql } from "drizzle-orm"
import { withSystemContext } from "@/lib/db/tenant-context"

const TABLES = [
  "campaigns",
  "campaign_targets",
  "campaign_attributions",
  "promos",
  "contacts",
  "lead_origin_events",
  "lead_consent_events",
] as const

async function isDbAvailable(): Promise<boolean> {
  try {
    await withSystemContext(async (tx) => {
      await tx.execute(sql`select 1`)
    })
    return true
  } catch {
    return false
  }
}

let dbAvailable = false
const skipReason = () => "Postgres local indisponible (DATABASE_URL)."

test.before(async () => {
  dbAvailable = await isDbAvailable()
})

test("CRM tables : RLS is enabled and FORCE RLS is enabled on all seven tenant-scoped tables", async (t) => {
  if (!dbAvailable) return t.skip(skipReason())

  const rows = await withSystemContext((tx) =>
    tx.execute(sql`
      select relname, relrowsecurity, relforcerowsecurity
      from pg_class
      where relname in (
        ${TABLES[0]},
        ${TABLES[1]},
        ${TABLES[2]},
        ${TABLES[3]},
        ${TABLES[4]},
        ${TABLES[5]},
        ${TABLES[6]}
      )
      order by relname
    `),
  )

  assert.equal(rows.length, TABLES.length, "les 7 tables CRM doivent exister")

  for (const row of rows as unknown as Array<{
    relname: string
    relrowsecurity: boolean
    relforcerowsecurity: boolean
  }>) {
    assert.equal(
      row.relrowsecurity,
      true,
      `${row.relname} : RLS doit être activée`,
    )
    assert.equal(
      row.relforcerowsecurity,
      true,
      `${row.relname} : FORCE ROW LEVEL SECURITY doit être activée`,
    )
  }
})
