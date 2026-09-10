/**
 * Chiffrement authentifié au repos pour des secrets applicatifs (ex.
 * identifiants fournisseur hôtelier). Aucun mécanisme de chiffrement
 * n'existe ailleurs dans ce dépôt (grep exhaustif — ni AES/KMS/Vault/
 * pgsodium/pgp_sym_encrypt) — implémentation minimale volontaire :
 *   - AES-256-GCM (chiffrement authentifié, node:crypto natif, aucune
 *     dépendance ajoutée)
 *   - clé lue depuis l'environnement serveur (jamais côté client)
 *   - ciphertext versionné (préfixe "v<N>:") pour permettre une future
 *     rotation de clé sans casser les valeurs déjà chiffrées
 *   - déchiffrement UNIQUEMENT via ce module, jamais inline ailleurs
 *
 * Pas de dépendance à un vault cloud — non requis à ce stade (mission
 * section "CREDENTIAL SECURITY" : "Do not invent a cloud vault dependency
 * unless required").
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // recommandé pour GCM
const CURRENT_KEY_VERSION = 1

export class SecretCryptoNotConfiguredError extends Error {
  constructor() {
    super(
      "SUPPLIER_CREDENTIALS_ENCRYPTION_KEY absente — impossible de chiffrer/déchiffrer un secret fournisseur. " +
        "Générer avec: openssl rand -hex 32",
    )
    this.name = "SecretCryptoNotConfiguredError"
  }
}

function getKey(version: number): Buffer {
  if (version !== CURRENT_KEY_VERSION) {
    throw new Error(`Version de clé de chiffrement inconnue: ${version} (seule la version ${CURRENT_KEY_VERSION} existe aujourd'hui).`)
  }
  const raw = process.env.SUPPLIER_CREDENTIALS_ENCRYPTION_KEY
  if (!raw) throw new SecretCryptoNotConfiguredError()
  // Accepte soit une clé hex 64 caractères (32 octets), soit dérive une clé
  // 32 octets par SHA-256 de la valeur fournie — jamais de clé plus courte
  // que 256 bits utilisée telle quelle.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex")
  return createHash("sha256").update(raw).digest()
}

export interface EncryptedSecret {
  /** "v<version>:<iv base64>:<authTag base64>:<ciphertext base64>" — jamais interprété hors de ce module. */
  ciphertext: string
  keyVersion: number
}

/** Chiffre une valeur JSON-sérialisable (ex. { login, password }) — jamais appelée avec une valeur déjà en clair vers un log. */
export function encryptSecret(value: unknown): EncryptedSecret {
  const keyVersion = CURRENT_KEY_VERSION
  const key = getKey(keyVersion)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), "utf-8")
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const ciphertext = `v${keyVersion}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`
  return { ciphertext, keyVersion }
}

/** Déchiffre — seul point d'entrée légitime pour lire un secret fournisseur en clair. Ne jamais logger la valeur retournée. */
export function decryptSecret<T = unknown>(ciphertext: string): T {
  const parts = ciphertext.split(":")
  if (parts.length !== 4 || !parts[0]?.startsWith("v")) {
    throw new Error("Format de secret chiffré invalide (corrompu ou non émis par ce module).")
  }
  const [versionTag, ivB64, authTagB64, dataB64] = parts as [string, string, string, string]
  const version = Number(versionTag.slice(1))
  const key = getKey(version)
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")
  const data = Buffer.from(dataB64, "base64")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString("utf-8")) as T
}

/** Utilitaire d'affichage sûr — jamais la valeur réelle, uniquement pour l'UI ("••••••••"). */
export function maskSecretForDisplay(): string {
  return "••••••••"
}
