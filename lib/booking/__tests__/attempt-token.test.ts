/**
 * GUEST-IDEMPOTENCY-01 — socle du jeton de tentative (pur, sans base).
 */
import test from "node:test"
import assert from "node:assert/strict"
import {
  ATTEMPT_TOKEN_TTL_MS,
  decideReplay,
  fingerprintIdentity,
  fingerprintRequest,
  getAttemptTokenMode,
  issueAttemptToken,
  verifyAttemptToken,
} from "../attempt-token"

const ORG = "11111111-1111-4111-8111-111111111111"
const OTHER_ORG = "22222222-2222-4222-8222-222222222222"

test("mode : off par défaut et sur toute valeur inconnue (fail-safe)", () => {
  assert.equal(getAttemptTokenMode({}), "off")
  assert.equal(getAttemptTokenMode({ GUEST_ATTEMPT_TOKEN_MODE: "??" }), "off")
  assert.equal(
    getAttemptTokenMode({ GUEST_ATTEMPT_TOKEN_MODE: "dual" }),
    "dual",
  )
  assert.equal(
    getAttemptTokenMode({ GUEST_ATTEMPT_TOKEN_MODE: " ENFORCE " }),
    "enforce",
  )
})

test("jeton : émis puis vérifié ; deux jetons ont deux clés distinctes", () => {
  const a = issueAttemptToken("transfer", ORG)
  const b = issueAttemptToken("transfer", ORG)
  const va = verifyAttemptToken(a, "transfer", ORG)
  const vb = verifyAttemptToken(b, "transfer", ORG)
  assert.ok(va.ok && vb.ok)
  if (va.ok && vb.ok) {
    assert.notEqual(va.key, vb.key)
    assert.match(va.key, /^[0-9a-f]{64}$/)
    // même jeton → même clé (rejeu stable)
    const again = verifyAttemptToken(a, "transfer", ORG)
    assert.ok(again.ok && again.key === va.key)
  }
})

test("jeton : falsifié, tronqué, expiré, autre organisation, autre module → refus", () => {
  const t = issueAttemptToken("transfer", ORG, 1_000)
  const [payload, sig] = t.split(".")
  const tamperedPayload = Buffer.from(
    JSON.stringify({ m: "transfer", o: ORG, i: "00".repeat(16), x: 9e15 }),
  ).toString("base64url")
  const r = (tok: unknown, org = ORG, now = 2_000) =>
    verifyAttemptToken(tok, "transfer", org, now)
  assert.equal(r(`${tamperedPayload}.${sig}`).ok, false)
  assert.equal(r(`${payload}.${sig.slice(0, -2)}AA`).ok, false)
  assert.equal(r(payload).ok, false)
  assert.equal(r(undefined).ok, false)
  assert.equal(r("x".repeat(600)).ok, false)
  const wrongOrg = r(t, OTHER_ORG)
  assert.ok(!wrongOrg.ok && wrongOrg.reason === "wrong_scope")
  const expired = r(t, ORG, 1_000 + ATTEMPT_TOKEN_TTL_MS + 1)
  assert.ok(!expired.ok && expired.reason === "expired")
  const wrongModule = verifyAttemptToken(
    t,
    "other" as unknown as "transfer",
    ORG,
    2_000,
  )
  assert.ok(!wrongModule.ok && wrongModule.reason === "wrong_scope")
})

test("jeton de prix ≠ jeton de tentative (secret dérivé distinct)", async () => {
  const { signHotelPriceToken } = await import("../price-token")
  const priceTok = signHotelPriceToken({
    hotelId: 1,
    roomId: 1,
    boardingId: 1,
    checkin: "2027-01-01",
    checkout: "2027-01-02",
    adults: 1,
    currency: "TND",
    unitPriceTnd: 100,
  })
  assert.equal(verifyAttemptToken(priceTok, "transfer", ORG).ok, false)
})

test("empreintes : normalisées, liées à l'organisation, sensibles au contenu", () => {
  const i1 = fingerprintIdentity("transfer", ORG, {
    email: " A@B.com ",
    phone: "+216 20 000 001",
  })
  const i2 = fingerprintIdentity("transfer", ORG, {
    email: "a@b.com",
    phone: "21620000001",
  })
  assert.equal(i1, i2)
  assert.notEqual(
    i1,
    fingerprintIdentity("transfer", OTHER_ORG, {
      email: "a@b.com",
      phone: "21620000001",
    }),
  )
  assert.notEqual(
    i1,
    fingerprintIdentity("transfer", ORG, {
      email: "c@d.com",
      phone: "21620000001",
    }),
  )
  const r1 = fingerprintRequest("transfer", ORG, i1, ["z1", "z2", "sedan", 2])
  assert.notEqual(
    r1,
    fingerprintRequest("transfer", ORG, i1, ["z1", "z2", "van", 2]),
  )
  assert.notEqual(
    r1,
    fingerprintRequest("transfer", ORG, i1, ["z1", "z2", "sedan", 3]),
  )
  // pas de collision par concaténation
  assert.notEqual(
    fingerprintRequest("transfer", ORG, i1, ["ab", "c"]),
    fingerprintRequest("transfer", ORG, i1, ["a", "bc"]),
  )
})

test("rejeu : mêmes empreintes → renvoi ; identité ou contenu différents → refus", () => {
  const cur = { identityFp: "i", requestFp: "r" }
  assert.equal(
    decideReplay({ identityFp: "i", requestFp: "r" }, cur),
    "return_existing",
  )
  assert.equal(
    decideReplay({ identityFp: "x", requestFp: "r" }, cur),
    "mismatch",
  )
  assert.equal(
    decideReplay({ identityFp: "i", requestFp: "x" }, cur),
    "mismatch",
  )
  assert.equal(decideReplay({}, cur), "mismatch")
})
