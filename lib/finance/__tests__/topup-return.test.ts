import test from "node:test"
import assert from "node:assert/strict"
import {
  parseTopupReturnId,
  topupReturnFeedback,
} from "@/lib/finance/topup-return"

test("parseTopupReturnId : seul un UUID est exploitable", () => {
  const id = "3f1c2b9a-6d4e-4b8a-9c1d-2e5f7a8b9c0d"
  assert.equal(parseTopupReturnId(id), id)
  assert.equal(parseTopupReturnId(undefined), null)
  // anciens paramètres d'URL : ne doivent plus rien afficher
  assert.equal(parseTopupReturnId("success"), null)
  assert.equal(parseTopupReturnId("cancelled"), null)
  assert.equal(parseTopupReturnId(`${id}' or 1=1`), null)
})

test("topupReturnFeedback : message dérivé du statut réel uniquement", () => {
  assert.equal(topupReturnFeedback("completed"), "completed")
  assert.equal(topupReturnFeedback("pending"), "pending")
  assert.equal(topupReturnFeedback("failed"), "failed")
  assert.equal(topupReturnFeedback(undefined), null)
  assert.equal(topupReturnFeedback(null), null)
  assert.equal(topupReturnFeedback("validated"), null)
})
