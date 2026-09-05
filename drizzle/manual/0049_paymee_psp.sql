-- E2B-003 — Adaptateur Paymee réel (paiement B2C en ligne, redirection
-- hébergée TND). Ajoute la valeur d'enum 'paymee' à payment_psp : les
-- lignes `payments`/`psp_webhooks` doivent pouvoir tracer un paiement réel
-- passé par Paymee, exactement comme 'sps'/'stripe'/'virtual' le font déjà.
alter type payment_psp add value if not exists 'paymee';
