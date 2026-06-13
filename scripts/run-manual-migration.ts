/**
 * Script pour exécuter la migration manuelle des enums fusionnés
 * 
 * Usage: npx tsx scripts/run-manual-migration.ts
 */

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as dotenv from "dotenv"

// Charger les variables d'environnement
dotenv.config({ path: ".env.local" })

const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL

if (!url) {
  console.error("DATABASE_URL ou DATABASE_DIRECT_URL non défini")
  process.exit(1)
}

async function runMigration() {
  console.log("🚀 Démarrage de la migration des enums fusionnés...")
  
  const client = postgres(url!)
  const db = drizzle(client)
  
  try {
    // Étape 1: Ajouter 'hybrid' à margin_type
    console.log("📝 Ajout de 'hybrid' à margin_type...")
    await client`
      DO $$
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM pg_enum 
              WHERE enumlabel = 'hybrid' 
              AND enumtypid = 'margin_type'::regtype::oid
          ) THEN
              ALTER TYPE margin_type ADD VALUE 'hybrid';
          END IF;
      END $$;
    `
    console.log("✅ margin_type mis à jour")
    
    // Étape 2: Créer le nouvel enum wallet_tx_type avec valeurs minuscules
    console.log("📝 Création du nouvel enum wallet_tx_type...")
    try {
      await client`
        CREATE TYPE wallet_tx_type_new AS ENUM ('credit', 'debit', 'refund', 'adjustment', 'commission', 'escrow_in', 'escrow_out');
      `
      console.log("✅ wallet_tx_type_new créé")
    } catch (error: any) {
      if (error.message.includes("already exists")) {
        console.log("⚠️  wallet_tx_type_new existe déjà, continuation...")
      } else {
        throw error
      }
    }
    
    // Étape 3: Convertir les données existantes
    console.log("📝 Conversion des données wallet_transactions...")
    await client`
      ALTER TABLE wallet_transactions 
        ALTER COLUMN type TYPE wallet_tx_type_new 
        USING CASE type
          WHEN 'CREDIT' THEN 'credit'::wallet_tx_type_new
          WHEN 'DEBIT' THEN 'debit'::wallet_tx_type_new
          WHEN 'REFUND' THEN 'refund'::wallet_tx_type_new
          WHEN 'ADJUSTMENT' THEN 'adjustment'::wallet_tx_type_new
          ELSE type::text::wallet_tx_type_new
        END;
    `
    console.log("✅ Données converties")
    
    // Étape 4: Supprimer l'ancien enum
    console.log("📝 Suppression de l'ancien enum wallet_tx_type...")
    try {
      await client`DROP TYPE wallet_tx_type;`
      console.log("✅ Ancien enum supprimé")
    } catch (error: any) {
      if (error.message.includes("cannot be dropped")) {
        console.log("⚠️  Ancien enum toujours utilisé, tentative forcée...")
        // Forcer la suppression en cascade
        await client`DROP TYPE wallet_tx_type CASCADE;`
        console.log("✅ Ancien enum supprimé (CASCADE)")
      } else {
        throw error
      }
    }
    
    // Étape 5: Renommer le nouvel enum
    console.log("📝 Renommage de wallet_tx_type_new → wallet_tx_type...")
    await client`ALTER TYPE wallet_tx_type_new RENAME TO wallet_tx_type;`
    console.log("✅ Enum renommé")
    
    // Vérification
    console.log("\n🔍 Vérification des enums...")
    const enums = await client`
      SELECT enumlabel, enumtypid::regtype 
      FROM pg_enum 
      WHERE enumtypid::regtype IN ('margin_type'::regtype, 'wallet_tx_type'::regtype)
      ORDER BY enumtypid::regtype, enumsortorder;
    `
    console.table(enums)
    
    console.log("\n🔍 Vérification des données wallet_transactions...")
    const txData = await client`
      SELECT type, COUNT(*) as count 
      FROM wallet_transactions 
      GROUP BY type;
    `
    console.table(txData)
    
    console.log("\n✅ Migration terminée avec succès!")
    
  } catch (error) {
    console.error("❌ Erreur lors de la migration:", error)
    throw error
  } finally {
    await client.end()
  }
}

runMigration().catch((error) => {
  console.error("Migration échouée:", error)
  process.exit(1)
})
