import test from "node:test"
import assert from "node:assert/strict"
import { encryptSecret, decryptSecret, SecretCryptoNotConfiguredError, maskSecretForDisplay } from "../secret-crypto"

const TEST_KEY = "a".repeat(64) // hex 32 octets valide

function withKey<T>(fn: () => T): T {
  const saved = process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY
  process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY = TEST_KEY
  try {
    return fn()
  } finally {
    if (saved === undefined) delete process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY
    else process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY = saved
  }
}

test("encrypt/decrypt : round-trip fidèle pour un objet credentials", () => {
  withKey(() => {
    const original = { login: "agencyA-mygo-user", password: "s3cr3t!" }
    const { ciphertext, keyVersion } = encryptSecret(original)
    assert.equal(keyVersion, 1)
    assert.ok(ciphertext.startsWith("v1:"))
    const decrypted = decryptSecret<typeof original>(ciphertext)
    assert.deepEqual(decrypted, original)
  })
})

test("encrypt : le ciphertext ne contient jamais le texte en clair", () => {
  withKey(() => {
    const { ciphertext } = encryptSecret({ login: "very-unique-marker-xyz", password: "another-unique-marker-abc" })
    assert.equal(ciphertext.includes("very-unique-marker-xyz"), false)
    assert.equal(ciphertext.includes("another-unique-marker-abc"), false)
  })
})

test("encrypt : deux chiffrements de la même valeur produisent des ciphertexts différents (IV aléatoire)", () => {
  withKey(() => {
    const a = encryptSecret({ login: "x", password: "y" })
    const b = encryptSecret({ login: "x", password: "y" })
    assert.notEqual(a.ciphertext, b.ciphertext)
  })
})

test("decrypt : un ciphertext altéré (tamper) échoue — authentification GCM", () => {
  withKey(() => {
    const { ciphertext } = encryptSecret({ login: "x", password: "y" })
    const parts = ciphertext.split(":")
    // alter un octet du ciphertext base64 lui-même
    const tampered = [...parts]
    tampered[3] = Buffer.from("tampereddata").toString("base64")
    assert.throws(() => decryptSecret(tampered.join(":")))
  })
})

test("sans SUPPLIER_CREDENTIALS_ENCRYPTION_KEY configurée, échoue explicitement plutôt que de stocker en clair", () => {
  const saved = process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY
  delete process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY
  try {
    assert.throws(() => encryptSecret({ login: "x", password: "y" }), SecretCryptoNotConfiguredError)
  } finally {
    if (saved !== undefined) process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY = saved
  }
})

test("maskSecretForDisplay : ne renvoie jamais une valeur en clair", () => {
  assert.equal(maskSecretForDisplay(), "••••••••")
})
