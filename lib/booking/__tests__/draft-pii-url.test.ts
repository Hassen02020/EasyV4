/**
 * DRAFT-PII-URL-01 — le voyageur ne transite plus par l'URL ; cookie chiffré
 * par brouillon ; idempotence sans collision entre clients ; ancien ?d= lu
 * sans jamais être réécrit.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import type { TravelerInput } from "../schemas"
import {
  LEGACY_TRAVELER_IN_URL_UNTIL,
  TRAVELER_COOKIE_MAX,
  TRAVELER_COOKIE_TTL_MS,
  canonicalTraveler,
  checkoutIdempotencyKey,
  isTravelerRef,
  newTravelerRef,
  openTraveler,
  sealTraveler,
  travelerCookieName,
} from "../traveler-cookie"
import { decodeDraft, draftOnlyToken, encodeDraft } from "../draft-store"
import { resolveTraveler } from "../resolve-traveler"

const A: TravelerInput = {
  civility: "M",
  firstName: "Sami",
  lastName: "Test",
  email: "sami@example.com",
  phone: "+216 98 123 456",
  civicIdType: "cin",
  civicId: "12345678",
  birthDate: "",
  nationality: "",
}
const B: TravelerInput = { ...A, firstName: "Leila", civicId: "87654321" }
const draft = {
  module: "hotel" as const,
  offerId: "500001-1-1",
  offerLabel: "Hôtel Test",
  startDate: "2026-09-10",
  endDate: "2026-09-13",
  adults: 2,
  children: 0,
  unitPriceTnd: 250,
  currency: "TND" as const,
}

// ---- cookie chiffré -------------------------------------------------------

test("cookie : aller-retour, le clair n'apparaît pas dans la valeur", () => {
  const ref = newTravelerRef()
  const sealed = sealTraveler(ref, A)
  assert.deepEqual(openTraveler(ref, sealed)?.traveler, A)
  for (const clear of ["12345678", "sami@example.com", "Sami"]) {
    assert.ok(!sealed.includes(clear))
    assert.ok(
      !Buffer.from(sealed, "base64url").toString("latin1").includes(clear),
    )
  }
})

test("cookie falsifié → refusé (un octet modifié)", () => {
  const ref = newTravelerRef()
  const raw = Buffer.from(sealTraveler(ref, A), "base64url")
  raw[raw.length - 1] ^= 1
  assert.equal(openTraveler(ref, raw.toString("base64url")), null)
  const raw2 = Buffer.from(sealTraveler(ref, A), "base64url")
  raw2[14] ^= 1 // étiquette d'authentification
  assert.equal(openTraveler(ref, raw2.toString("base64url")), null)
})

test("cookie d'un autre brouillon → refusé (identifiant lié en AAD)", () => {
  const r1 = newTravelerRef()
  const r2 = newTravelerRef()
  assert.equal(openTraveler(r2, sealTraveler(r1, A)), null)
})

test("cookie absent, vide ou aberrant → null", () => {
  const ref = newTravelerRef()
  for (const v of [undefined, null, "", "x", "AAAA", "!!!!"]) {
    assert.equal(openTraveler(ref, v as string | undefined), null)
  }
  assert.equal(openTraveler("pas-une-ref", sealTraveler(ref, A)), null)
})

test("cookie expiré → refusé ; horodatage dans le futur → refusé", () => {
  const ref = newTravelerRef()
  const now = Date.now()
  const old = sealTraveler(ref, A, now - TRAVELER_COOKIE_TTL_MS - 1000)
  assert.equal(openTraveler(ref, old, now), null)
  const fresh = sealTraveler(ref, A, now - TRAVELER_COOKIE_TTL_MS + 60_000)
  assert.ok(openTraveler(ref, fresh, now))
  const future = sealTraveler(ref, A, now + 3_600_000)
  assert.equal(openTraveler(ref, future, now), null)
})

test("référence : 22 caractères sûrs, nom de cookie sans injection", () => {
  const ref = newTravelerRef()
  assert.ok(isTravelerRef(ref))
  assert.equal(travelerCookieName(ref), `e2b_trv_${ref}`)
  for (const bad of [
    "",
    "a;b",
    "x".repeat(21),
    "x".repeat(23),
    "a b".padEnd(22, "x"),
  ])
    assert.equal(isTravelerRef(bad), false)
  assert.throws(() => travelerCookieName("a;path=/"))
  assert.ok(TRAVELER_COOKIE_MAX >= 2)
})

// ---- idempotence ----------------------------------------------------------

test("idempotence : deux clients différents → clés différentes", () => {
  const token = draftOnlyToken({ draft })
  const kA = checkoutIdempotencyKey({
    token,
    traveler: A,
    mode: "at_hotel",
    legacyTokenHasTraveler: false,
  })
  const kB = checkoutIdempotencyKey({
    token,
    traveler: B,
    mode: "at_hotel",
    legacyTokenHasTraveler: false,
  })
  assert.notEqual(kA, kB)
})

test("idempotence : même client, même soumission → même clé ; mode ou brouillon différent → clé différente", () => {
  const token = draftOnlyToken({ draft })
  const k = (t: TravelerInput, mode: string, tok = token) =>
    checkoutIdempotencyKey({
      token: tok,
      traveler: t,
      mode,
      legacyTokenHasTraveler: false,
    })
  assert.equal(k(A, "card"), k({ ...A }, "card"))
  // L'ordre des clés du voyageur ne change pas la clé.
  const shuffled = Object.fromEntries(
    Object.entries(A).reverse(),
  ) as TravelerInput
  assert.equal(canonicalTraveler(A), canonicalTraveler(shuffled))
  assert.equal(k(A, "card"), k(shuffled, "card"))
  assert.notEqual(k(A, "card"), k(A, "cash"))
  assert.notEqual(k(A, "card"), k(A, "b2b"))
  const other = draftOnlyToken({ draft: { ...draft, offerId: "autre" } })
  assert.notEqual(k(A, "card"), k(A, "card", other))
})

test("idempotence : HMAC (pas un sha256 simple du contenu)", () => {
  const token = draftOnlyToken({ draft })
  const key = checkoutIdempotencyKey({
    token,
    traveler: A,
    mode: "card",
    legacyTokenHasTraveler: false,
  })
  const plain = createHash("sha256")
    .update(`${token}\n${canonicalTraveler(A)}\ncard`)
    .digest("hex")
  assert.notEqual(key, plain)
  assert.match(key, /^[0-9a-f]{64}$/)
})

test("migration : ancien ?d= avec voyageur → clé IDENTIQUE à l'ancienne formule (aucun doublon)", () => {
  // Valeurs figées calculées avec la formule d'origine :
  // sha256(`${token}:b2b`) et sha256(`${token}:${paymentMethod}`).
  const legacyToken = encodeDraft({ draft, traveler: A })
  const before = (mode: string) =>
    createHash("sha256").update(`${legacyToken}:${mode}`).digest("hex")
  for (const mode of ["b2b", "card", "cash", "at_hotel"]) {
    assert.equal(
      checkoutIdempotencyKey({
        token: legacyToken,
        traveler: A,
        mode,
        legacyTokenHasTraveler: true,
      }),
      before(mode),
    )
  }
  assert.equal(
    createHash("sha256").update("TOKEN-X:b2b").digest("hex"),
    "cef38138513654d454d47a124fdf003c389c7133ce7730d73d62448b93587fbc",
  )
  assert.equal(
    checkoutIdempotencyKey({
      token: "TOKEN-X",
      traveler: A,
      mode: "b2b",
      legacyTokenHasTraveler: true,
    }),
    "cef38138513654d454d47a124fdf003c389c7133ce7730d73d62448b93587fbc",
  )
  // Deux clients en ancien format restent distincts (le token porte le voyageur).
  assert.notEqual(
    checkoutIdempotencyKey({
      token: encodeDraft({ draft, traveler: A }),
      traveler: A,
      mode: "card",
      legacyTokenHasTraveler: true,
    }),
    checkoutIdempotencyKey({
      token: encodeDraft({ draft, traveler: B }),
      traveler: B,
      mode: "card",
      legacyTokenHasTraveler: true,
    }),
  )
})

// ---- ancien ?d= -----------------------------------------------------------

test("ancien ?d= lu : draftOnlyToken ne recopie jamais le voyageur", () => {
  const legacy = decodeDraft(encodeDraft({ draft, traveler: A }))!
  assert.ok(legacy.traveler)
  const clean = draftOnlyToken(legacy)
  assert.equal(decodeDraft(clean)?.traveler, undefined)
  const asText = Buffer.from(clean, "base64url").toString("utf8")
  for (const clear of ["12345678", "sami@example.com", "Sami", "civicId"])
    assert.ok(!asText.includes(clear), clear)
})

test("ancien ?d= : lu avant la date de fin, ignoré après", async () => {
  const legacy = decodeDraft(encodeDraft({ draft, traveler: A }))!
  const before = await resolveTraveler(
    legacy,
    undefined,
    LEGACY_TRAVELER_IN_URL_UNTIL - 1,
  )
  assert.deepEqual(before, { traveler: A, legacy: true })
  assert.equal(
    await resolveTraveler(legacy, undefined, LEGACY_TRAVELER_IN_URL_UNTIL),
    null,
  )
  assert.equal(
    await resolveTraveler(
      { draft },
      undefined,
      LEGACY_TRAVELER_IN_URL_UNTIL - 1,
    ),
    null,
  )
  assert.equal(
    new Date(LEGACY_TRAVELER_IN_URL_UNTIL).toISOString(),
    "2026-12-01T00:00:00.000Z",
  )
})

// ---- grep de sortie : aucun voyageur dans une URL ---------------------------

function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (f === "node_modules" || f === ".next" || f === "__tests__") continue
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(ts|tsx)$/.test(f) && !/\.(test|spec)\./.test(f)) out.push(p)
  }
  return out
}

test("sortie : plus aucun encodeDraft({ … traveler … }) dans le code applicatif", () => {
  const offenders: string[] = []
  for (const dir of ["app", "components", "lib"]) {
    for (const f of sources(dir)) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(
        /encodeDraft\(\s*\{[\s\S]{0,400}?\}\s*\)/g,
      )) {
        if (/\btraveler\b/.test(m[0])) offenders.push(f)
      }
    }
  }
  assert.deepEqual(offenders, [])
})

test("sortie : aucune URL/redirection du tunnel ne porte le token brut ni un voyageur", () => {
  const files = [
    "components/booking/travelers-form.tsx",
    "app/(public)/[locale]/booking/travelers/page.tsx",
    "app/(public)/[locale]/booking/checkout/page.tsx",
    "app/(public)/[locale]/booking/page.tsx",
  ]
  for (const f of files) {
    const src = readFileSync(f, "utf8")
    assert.doesNotMatch(src, /\?d=\$\{encodeURIComponent\(token2?(\s|\?|\))/, f)
    assert.doesNotMatch(src, /[?&]traveler=/, f)
  }
  const form = readFileSync("components/booking/travelers-form.tsx", "utf8")
  assert.match(form, /draftOnlyToken\(payload\)/)
  assert.match(form, /saveTravelerAction\(/)
  assert.doesNotMatch(form, /encodeDraft/)
})

test("sortie : aucun log/journal ne reçoit le voyageur (actions serveur du cookie)", () => {
  const src = readFileSync("lib/booking/traveler-cookie-actions.ts", "utf8")
  assert.doesNotMatch(src, /console\.|logger\./)
  assert.match(src, /httpOnly: true/)
  assert.match(src, /sameSite: "lax"/)
  assert.match(src, /TRAVELER_COOKIE_MAX/)
})
