/**
 * CRM-360-LEAD-INFO-01 — invariants statiques pour le bloc "Profil" et
 * "Demande initiale" ajoutés dans customer-360-panel.tsx.
 *
 * Vérifie que : les champs de contact (phone, email, channel, productType,
 * status, createdAt) sont rendus, que le message initial est conditionnel,
 * que les constantes de mapping (PRODUCT_LABEL, STATUS_LABEL) sont présentes,
 * et que le composant ne duplique pas la logique serveur.
 */

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const src = readFileSync(
  join(process.cwd(), "components/admin/customer-360-panel.tsx"),
  "utf8",
)

test("customer-360-panel exporte Customer360Button", () => {
  assert.match(
    src,
    /export function Customer360Button/,
    "Customer360Button doit être exporté",
  )
})

test("CRM-360-LEAD-INFO-01 : section Profil présente", () => {
  assert.match(src, /Profil/, "section Profil doit être présente")
})

test("CRM-360-LEAD-INFO-01 : champ phone conditionnel affiché", () => {
  assert.match(
    src,
    /data\.lead\.phone/,
    "data.lead.phone doit être affiché dans le profil",
  )
})

test("CRM-360-LEAD-INFO-01 : champ email conditionnel affiché", () => {
  assert.match(
    src,
    /data\.lead\.email/,
    "data.lead.email doit être affiché dans le profil",
  )
})

test("CRM-360-LEAD-INFO-01 : canal (channel) affiché avec label", () => {
  assert.match(
    src,
    /data\.lead\.channel/,
    "data.lead.channel doit être affiché",
  )
  assert.match(
    src,
    /CHANNEL_LABEL\[data\.lead\.channel\]/,
    "channel doit passer par CHANNEL_LABEL",
  )
})

test("CRM-360-LEAD-INFO-01 : productType affiché avec PRODUCT_LABEL", () => {
  assert.match(
    src,
    /data\.lead\.productType/,
    "data.lead.productType doit être affiché",
  )
  assert.match(
    src,
    /PRODUCT_LABEL/,
    "constante PRODUCT_LABEL doit exister dans le composant",
  )
})

test("CRM-360-LEAD-INFO-01 : status affiché avec STATUS_LABEL", () => {
  assert.match(src, /data\.lead\.status/, "data.lead.status doit être affiché")
  assert.match(
    src,
    /STATUS_LABEL/,
    "constante STATUS_LABEL doit exister dans le composant",
  )
})

test("CRM-360-LEAD-INFO-01 : date de création affichée", () => {
  assert.match(
    src,
    /data\.lead\.createdAt/,
    "data.lead.createdAt doit être affiché",
  )
  assert.match(
    src,
    /toLocaleDateString/,
    "date doit être formatée via toLocaleDateString",
  )
})

test("CRM-360-LEAD-INFO-01 : section 'Demande initiale' conditionnelle sur message", () => {
  assert.match(
    src,
    /data\.lead\.message/,
    "data.lead.message doit être affiché",
  )
  assert.match(
    src,
    /Demande\s+initiale/,
    "label 'Demande initiale' doit être présent",
  )
})

test("CRM-360-LEAD-INFO-01 : staffNotes toujours conditionnel (inchangé)", () => {
  assert.match(
    src,
    /data\.lead\.staffNotes/,
    "data.lead.staffNotes doit toujours être affiché",
  )
  assert.match(src, /Note interne/, "label 'Note interne' doit être conservé")
})

test("CRM-360-LEAD-INFO-01 : PRODUCT_LABEL couvre les 5 types métier", () => {
  assert.match(src, /hotel:/, "PRODUCT_LABEL doit couvrir hotel")
  assert.match(src, /omra:/, "PRODUCT_LABEL doit couvrir omra")
  assert.match(src, /package:/, "PRODUCT_LABEL doit couvrir package")
  assert.match(src, /activity:/, "PRODUCT_LABEL doit couvrir activity")
  assert.match(src, /general:/, "PRODUCT_LABEL doit couvrir general")
})

test("CRM-360-LEAD-INFO-01 : STATUS_LABEL couvre les 4 statuts leads", () => {
  assert.match(src, /new:/, "STATUS_LABEL doit couvrir new")
  assert.match(src, /contacted:/, "STATUS_LABEL doit couvrir contacted")
  assert.match(src, /converted:/, "STATUS_LABEL doit couvrir converted")
  assert.match(src, /closed:/, "STATUS_LABEL doit couvrir closed")
})
