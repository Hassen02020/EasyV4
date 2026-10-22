/**
 * Création des utilisateurs GoTrue pour l'environnement E2E local.
 *
 * Ce script est distinct de seed-base-infra.ts car il requiert l'Admin API
 * GoTrue (SUPABASE_SERVICE_ROLE_KEY) et non une connexion DB directe. Il
 * crée deux comptes avec des UUIDs fixes qui correspondent aux lignes déjà
 * insérées par seed-base-infra.ts dans la table `users`.
 *
 * Prérequis :
 *   NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans l'environnement.
 *
 * Idempotent : si l'utilisateur existe déjà, la création est ignorée.
 *
 * Usage :
 *   node --import tsx scripts/create-e2e-gotrue-users.ts
 */

import { createClient } from "@supabase/supabase-js"

const ADMIN_USER_ID = "11111111-1111-1111-1111-111111111111"
const PRO_USER_ID = "66666666-6666-6666-6666-666666666666"

const E2E_USERS: Array<{
  id: string
  email: string
  password: string
  role: string
}> = [
  {
    id: ADMIN_USER_ID,
    email: process.env.E2E_ADMIN_EMAIL ?? "admin.test@easy2book.local",
    password: process.env.E2E_ADMIN_PASSWORD ?? "TestPass123!",
    role: "super_admin",
  },
  {
    id: PRO_USER_ID,
    email: process.env.E2E_PRO_EMAIL ?? "pro.test@easy2book.local",
    password: process.env.E2E_PRO_PASSWORD ?? "TestPass123!",
    role: "partner_owner (Sahara Voyages)",
  },
]

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis",
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const user of E2E_USERS) {
    console.log(`[gotrue] Création ${user.role} (${user.email}) — ${user.id}`)

    const { error } = await supabase.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: user.password,
      email_confirm: true,
    })

    if (error) {
      if (
        error.message.toLowerCase().includes("already") ||
        error.message.toLowerCase().includes("already registered") ||
        error.code === "email_exists"
      ) {
        console.log(`  → déjà existant, ignoré.`)
      } else {
        console.error(`  ✗ erreur : ${error.message}`)
        throw error
      }
    } else {
      console.log(`  ✓ créé avec succès.`)
    }
  }

  console.log("\n[gotrue] Terminé.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
