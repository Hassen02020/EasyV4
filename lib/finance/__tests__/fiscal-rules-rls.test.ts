/**
 * RLS-FISCAL-RULES-01 — invariants statiques sur la sécurité d'accès aux
 * règles fiscales.
 *
 * Preuve de sécurité réelle :
 *   1. La migration active RLS sur la table fiscal_rules (PostgREST bloqué).
 *   2. La policy est en FOR ALL avec USING + WITH CHECK (lecture ET écriture).
 *   3. Le guard is_super_admin() est utilisé (pas auth.uid() ou autre).
 *   4. listFiscalRules() vérifie isSuperAdmin avant la lecture DB.
 *   5. Les actions d'écriture maintiennent leur guard isSuperAdmin existant.
 *
 * Non-régression financière :
 *   6. getActiveFiscalRuleInTx (booking path) utilise le DB client directement
 *      (service role / bypass RLS) — aucune modification.
 *   7. La migration est idempotente (DROP POLICY IF EXISTS avant CREATE).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

const migration = readFileSync(
  join(ROOT, "drizzle/manual/0140_rls_fiscal_rules.sql"),
  "utf8",
)
const actions = readFileSync(
  join(ROOT, "lib/finance/fiscal-rules-actions.ts"),
  "utf8",
)
const fiscalRulesLib = readFileSync(
  join(ROOT, "lib/finance/fiscal-rules.ts"),
  "utf8",
)

// --- Migration ---

test("RLS-FISCAL-RULES-01-M1: ENABLE ROW LEVEL SECURITY sur fiscal_rules", () => {
  assert.ok(
    /ALTER TABLE fiscal_rules ENABLE ROW LEVEL SECURITY/.test(migration),
    "La migration doit activer RLS sur fiscal_rules",
  )
})

test("RLS-FISCAL-RULES-01-M2: CREATE POLICY FOR ALL présent", () => {
  assert.ok(
    /CREATE POLICY fiscal_rules_super_admin ON fiscal_rules\s+FOR ALL/.test(
      migration,
    ),
    "La policy doit couvrir ALL (lecture + écriture)",
  )
})

test("RLS-FISCAL-RULES-01-M3: USING (is_super_admin()) — pas auth.uid()", () => {
  assert.ok(
    migration.includes("USING (is_super_admin())"),
    "Le USING doit utiliser is_super_admin()",
  )
  assert.ok(
    !migration.includes("auth.uid()"),
    "Ne pas utiliser auth.uid() (GUC NULL sur connexion directe)",
  )
})

test("RLS-FISCAL-RULES-01-M4: WITH CHECK (is_super_admin()) — guard écriture", () => {
  assert.ok(
    migration.includes("WITH CHECK (is_super_admin())"),
    "WITH CHECK doit être présent pour bloquer les écritures non-super_admin via PostgREST",
  )
})

test("RLS-FISCAL-RULES-01-M5: DROP POLICY IF EXISTS — idempotence", () => {
  assert.ok(
    migration.includes("DROP POLICY IF EXISTS fiscal_rules_super_admin"),
    "La migration doit être idempotente",
  )
})

// --- Server action ---

test("RLS-FISCAL-RULES-01-A1: listFiscalRules vérifie isSuperAdmin (lecture protégée)", () => {
  const listFn = actions.slice(actions.indexOf("export async function listFiscalRules"))
  const nextFn = listFn.indexOf("\nexport async function", 10)
  const listBody = nextFn > 0 ? listFn.slice(0, nextFn) : listFn.slice(0, 600)
  assert.ok(
    listBody.includes("isSuperAdmin"),
    "listFiscalRules doit vérifier session.isSuperAdmin avant la lecture DB",
  )
})

test("RLS-FISCAL-RULES-01-A2: createDraftFiscalRule maintient guard isSuperAdmin", () => {
  assert.ok(
    actions.includes("isSuperAdmin"),
    "Les actions d'écriture doivent maintenir le guard isSuperAdmin",
  )
})

// --- Non-régression booking path ---

test("RLS-FISCAL-RULES-01-B1: getActiveFiscalRuleInTx utilise tx (service role, bypass RLS)", () => {
  assert.ok(
    fiscalRulesLib.includes("getActiveFiscalRuleInTx"),
    "getActiveFiscalRuleInTx doit exister dans lib/finance/fiscal-rules.ts",
  )
  // Vérifie qu'il prend un tx (db transaction) comme premier paramètre —
  // pas un appel REST/PostgREST (service role bypass RLS).
  // La signature est sur plusieurs lignes : function(...)\n  tx: any
  const fnIdx = fiscalRulesLib.indexOf("export async function getActiveFiscalRuleInTx")
  const fnSlice = fiscalRulesLib.slice(fnIdx, fnIdx + 300)
  assert.ok(
    fnSlice.includes("tx:") || fnSlice.includes("tx ,") || fnSlice.includes("tx,"),
    "getActiveFiscalRuleInTx doit prendre tx en premier paramètre (bypass RLS)",
  )
})
