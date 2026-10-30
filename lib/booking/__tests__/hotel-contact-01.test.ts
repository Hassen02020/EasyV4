/**
 * HOTEL-CONTACT-01 — la fiche hôtel publique n'affiche jamais les
 * coordonnées directes de l'hôtel (email / téléphone du fournisseur) : seules
 * celles de l'agence (Easy2Book ou tenant White Label) sont proposées.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"

const DIR = path.resolve(
  __dirname,
  "../../../app/(public)/[locale]/hotels/[id]",
)
const client = readFileSync(path.join(DIR, "hotel-detail-client.tsx"), "utf8")
const page = readFileSync(path.join(DIR, "page.tsx"), "utf8")

test("aucun lien vers l'email ou le téléphone de l'hôtel", () => {
  assert.doesNotMatch(client, /hotel\.email/)
  assert.doesNotMatch(client, /hotel\.phone/)
  assert.doesNotMatch(client, /mailto:/)
})

test("le bloc Contact utilise les coordonnées de l'agence", () => {
  assert.match(client, /href=\{`tel:\$\{agencyContact\.contactPhone\}`\}/)
  assert.match(client, /https:\/\/wa\.me\/\$\{waDigits\}/)
})

test("WhatsApp seulement s'il est configuré, jamais déduit du téléphone", () => {
  assert.match(client, /const waDigits = agencyContact\.whatsappNumber\?\./)
  assert.doesNotMatch(client, /waDigits\s*=[^\n]*contactPhone/)
})

test("page serveur : contact de l'agence du tenant courant, comme le header", () => {
  assert.doesNotMatch(page, /^"use client"/m)
  assert.match(page, /getRequestTenantInfo\(\)/)
  assert.match(page, /getSiteContactInfo\(tenant\?\.agencyId \?\? null\)/)
  assert.match(page, /<HotelDetailClient/)
})
