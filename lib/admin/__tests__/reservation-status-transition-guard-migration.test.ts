/**
 * R6-01-DB-CONSTRAINT — invariant statique : la migration SQL
 * (drizzle/manual/0090_reservation_status_transition_guard.sql) encode
 * EXACTEMENT les mêmes paires que `ALLOWED_TRANSITIONS`
 * (lib/admin/reservation-status.ts). Si l'une des deux est modifiée sans
 * l'autre, ce test casse — garde-fou de dérive entre la state machine
 * applicative et son miroir DB.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  RESERVATION_STATUSES,
  isTransitionAllowed,
} from "../reservation-status"

const sql = readFileSync(
  join(
    process.cwd(),
    "drizzle/manual/0090_reservation_status_transition_guard.sql",
  ),
  "utf8",
)

test("la migration encode une ligne OLD.status=X pour chaque statut non-terminal, et aucune pour les statuts terminaux", () => {
  for (const from of RESERVATION_STATUSES) {
    const hasOutgoing = RESERVATION_STATUSES.some(
      (to) => to !== from && isTransitionAllowed(from, to),
    )
    const pattern = new RegExp(`OLD\\.status = '${from}'`)
    assert.equal(
      pattern.test(sql),
      hasOutgoing,
      `OLD.status = '${from}' ${hasOutgoing ? "devrait apparaître (transitions sortantes existent)" : "ne devrait PAS apparaître (statut terminal)"}`,
    )
  }
})

test("chaque transition autorisée par isTransitionAllowed() apparaît dans la clause OLD.status du statut source, dans la migration SQL", () => {
  for (const from of RESERVATION_STATUSES) {
    const targets = RESERVATION_STATUSES.filter(
      (to) => to !== from && isTransitionAllowed(from, to),
    )
    if (targets.length === 0) continue
    const blockMatch = sql.match(
      new RegExp(
        `OLD\\.status = '${from}'[^)]*NEW\\.status (?:IN \\(([^)]*)\\)|= '([^']*)')`,
      ),
    )
    assert.ok(
      blockMatch,
      `bloc OLD.status = '${from}' introuvable dans la migration`,
    )
    const raw = blockMatch![1] ?? blockMatch![2] ?? ""
    const sqlTargets = raw
      .split(",")
      .map((s) => s.trim().replace(/'/g, ""))
      .filter(Boolean)
      .sort()
    assert.deepEqual(
      sqlTargets,
      [...targets].sort(),
      `cibles SQL pour OLD.status='${from}' (${sqlTargets.join(", ")}) ≠ ALLOWED_TRANSITIONS TS (${targets.join(", ")})`,
    )
  }
})
