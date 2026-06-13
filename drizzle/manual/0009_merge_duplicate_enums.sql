-- Migration: Fusion des Enums Dupliqués
-- Date: 2026-06-13
-- Description: Fusionner marginType et walletTxType dupliqués entre schema.ts et financials.ts

-- ============================================================================
-- 1. Fusion margin_type (ajouter valeur 'hybrid')
-- ============================================================================

-- margin_type existe déjà dans schema.ts avec ["percent", "fixed"]
-- margin_type_v6 existe dans financials.ts avec ["percent", "fixed", "hybrid"]
-- On ajoute 'hybrid' à l'enum existant margin_type

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

-- ============================================================================
-- 2. Fusion wallet_tx_type (conversion MAJUSCULES → minuscules)
-- ============================================================================

-- wallet_tx_type existe dans schema.ts avec ["CREDIT", "DEBIT", "REFUND", "ADJUSTMENT"]
-- wallet_tx_type_v6 existe dans financials.ts avec ["credit", "debit", "refund", "adjustment", "commission"]
-- On doit convertir les données existantes et renommer l'enum

-- Étape 1: Créer le nouvel enum avec les valeurs en minuscules
CREATE TYPE wallet_tx_type_new AS ENUM ('credit', 'debit', 'refund', 'adjustment', 'commission', 'escrow_in', 'escrow_out');

-- Étape 2: Convertir les données existantes dans wallet_transactions
ALTER TABLE wallet_transactions 
  ALTER COLUMN type TYPE wallet_tx_type_new 
  USING CASE type
    WHEN 'CREDIT' THEN 'credit'::wallet_tx_type_new
    WHEN 'DEBIT' THEN 'debit'::wallet_tx_type_new
    WHEN 'REFUND' THEN 'refund'::wallet_tx_type_new
    WHEN 'ADJUSTMENT' THEN 'adjustment'::wallet_tx_type_new
    ELSE type::text::wallet_tx_type_new
  END;

-- Étape 3: Supprimer l'ancien enum
DROP TYPE wallet_tx_type;

-- Étape 4: Renommer le nouvel enum
ALTER TYPE wallet_tx_type_new RENAME TO wallet_tx_type;

-- ============================================================================
-- 3. Nettoyage des enums V6 (après mise à jour du code)
-- ============================================================================

-- Ces commandes doivent être exécutées APRÈS avoir mis à jour le code pour utiliser
-- les enums unifiés (margin_type et wallet_tx_type au lieu des versions V6)

-- DROP TYPE IF EXISTS margin_type_v6;
-- DROP TYPE IF EXISTS wallet_tx_type_v6;

-- ============================================================================
-- 4. Vérification
-- ============================================================================

-- Vérifier les enums
SELECT enumlabel, enumtypid::regtype 
FROM pg_enum 
WHERE enumtypid::regtype IN ('margin_type'::regtype, 'wallet_tx_type'::regtype)
ORDER BY enumtypid::regtype, enumsortorder;

-- Vérifier les données après conversion
SELECT type, COUNT(*) 
FROM wallet_transactions 
GROUP BY type;
