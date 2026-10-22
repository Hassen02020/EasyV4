/**
 * CAS-B-PUBLIC-REF-LOCK-01 — Invariants de concurrence pour nextPublicRef()
 *
 * Sans pg_advisory_xact_lock, deux transactions concurrentes peuvent lire
 * le même MAX(publicRef) avant qu'aucune n'ait committé, produisant une
 * collision sur reservations_public_ref_uniq (PG 23505) → rollback d'une
 * des deux TX → réservation reste pending → retry directeur requis.
 *
 * Fix : pg_advisory_xact_lock(hashtext(agencyId + ":" + prefix)) exécuté
 * dans la transaction AVANT le SELECT MAX — verrou transactionnel
 * (auto-libéré au commit/rollback, jamais retenu au-delà).
 *
 * Ce fichier vérifie statiquement que les 6 implémentations de nextPublicRef()
 * qui n'étaient pas encore protégées appliquent bien ce verrou.
 * La Mutuelle (lib/mutuelle/booking-actions.ts) était déjà corrigée et sert
 * de référence (MUTUELLE-CONCURRENCY-COMPLETE-01).
 *
 * Modules couverts :
 *   TG- : lib/booking/actions.ts          (hôtels B2B/B2C + Network + Vols)
 *   OM- : lib/omra/booking-actions.ts
 *   CR- : lib/cars/actions.ts
 *   CR- : lib/cars/guest-booking-actions.ts
 *   TR- : lib/transfers/actions.ts
 *   TR- : lib/transfers/guest-booking-actions.ts
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const FILES: Record<string, string> = {
  "lib/booking/actions.ts": readFileSync(
    join(process.cwd(), "lib/booking/actions.ts"),
    "utf8",
  ),
  "lib/omra/booking-actions.ts": readFileSync(
    join(process.cwd(), "lib/omra/booking-actions.ts"),
    "utf8",
  ),
  "lib/cars/actions.ts": readFileSync(
    join(process.cwd(), "lib/cars/actions.ts"),
    "utf8",
  ),
  "lib/cars/guest-booking-actions.ts": readFileSync(
    join(process.cwd(), "lib/cars/guest-booking-actions.ts"),
    "utf8",
  ),
  "lib/transfers/actions.ts": readFileSync(
    join(process.cwd(), "lib/transfers/actions.ts"),
    "utf8",
  ),
  "lib/transfers/guest-booking-actions.ts": readFileSync(
    join(process.cwd(), "lib/transfers/guest-booking-actions.ts"),
    "utf8",
  ),
}

for (const [filePath, src] of Object.entries(FILES)) {
  test(`CAS-B [${filePath}] : pg_advisory_xact_lock présent dans nextPublicRef`, () => {
    assert.ok(
      src.includes("pg_advisory_xact_lock"),
      `${filePath} doit contenir pg_advisory_xact_lock dans nextPublicRef`,
    )
  })

  test(`CAS-B [${filePath}] : pg_advisory_xact_lock précède SELECT MAX(publicRef)`, () => {
    const lockIdx = src.indexOf("pg_advisory_xact_lock")
    const maxIdx = src.indexOf("MAX(${reservations.publicRef})")
    assert.ok(lockIdx > 0, "pg_advisory_xact_lock doit être présent")
    assert.ok(maxIdx > 0, "MAX(publicRef) doit être présent")
    assert.ok(
      lockIdx < maxIdx,
      "pg_advisory_xact_lock doit apparaître AVANT SELECT MAX(publicRef)",
    )
  })

  test(`CAS-B [${filePath}] : verrou scoped (agencyId + ":" + prefix)`, () => {
    assert.match(
      src,
      /pg_advisory_xact_lock\(hashtext\(\s*\$\{agencyId \+ ":" \+ prefix\}\s*\)\)/,
    )
  })
}
