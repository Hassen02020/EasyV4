-- Paiement B2C réel (Sprint "Paiement B2C réel") — ajoute la valeur d'enum
-- 'virtual' à payment_psp : le Virtual Payment Provider (lib/payment/
-- virtual-provider.ts, test/dev uniquement, jamais activé en prod — voir
-- PAYMENT_MODE dans .env.example) doit pouvoir écrire une ligne `payments`
-- réelle et traçable, exactement comme MyGo virtuel écrit des réservations
-- réelles avec un fournisseur "virtual" identifiable. Aucune donnée de
-- production n'utilisera jamais cette valeur.
alter type payment_psp add value if not exists 'virtual';
