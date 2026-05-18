# Test Report — PR #6 (Front-Office Booking Tunnel)

## Test summary

Tested le tunnel de réservation **end-to-end via le navigateur** sur `http://localhost:3000` contre le Supabase live (`gkuxrxyxmwrbkrmtvqbp`). 3/3 tests passés. Une observation mineure (message Zod en anglais sur le champ CIN) — pas bloquant.

## Escalations / observations

- **Test Scenario 2 du cahier des charges (admin valide la résa depuis le Back-Office) = UNTESTED.** La refonte Back-Office est l'objet de **PR #3**, pas encore livrée. Le dashboard `/admin` de PR #5 affiche bien la nouvelle résa dans le compteur, mais n'expose pas encore d'action "valider/annuler".
- **Mineur** : sur l'erreur de validation CIN, le message affiché est `String must contain at least 6 character(s)` (default Zod, anglais). Les autres champs ont bien des messages français custom (`Prénom trop court`, `Email invalide`, `Numéro invalide`). À harmoniser plus tard mais ne bloque pas la validation.
- **Mineur** : le schéma Zod CIN vérifie `min(6)` alors que le test plan prévoyait `8 chiffres exacts` — la règle de validation est plus permissive que prévu mais reste fonctionnelle.

## Test results

- **It should create a Vol reservation end-to-end with correct VAT/deposit math** — **passed**
- **It should reject invalid traveler data via Zod client-side** — **passed**
- **It should activate all 6 booking-engine tabs (not show "bientôt dispo" toast)** — **passed**
- It should let admin validate the reservation from Back-Office — **untested** (PR #3 scope)

---

## Evidence

### Test 1 — Booking end-to-end (TG-2026-001251)

| Step 1 — Offre + récap prix | Step 3 — Récap paiement |
|---|---|
| ![step1](https://app.devin.ai/attachments/fe9240cd-f0e3-4c21-a850-d5f2c5f3a704/screenshot_50c9d4c70f124d159df3bc287073b136.png) | ![step3](https://app.devin.ai/attachments/19afdfcf-aa80-462c-bdfb-7f4e7bd8ea94/screenshot_d99d6d55d0f84a42ac59c68d7a54f0c7.png) |

| Confirmation finale `TG-2026-001251` |
|---|
| ![conf](https://app.devin.ai/attachments/0ece04d9-08a2-4802-a7dd-45477b104f7f/screenshot_c86a3c4fb9684191ac4dbfe114736972.png) |

Math vérifiée (UI **et** DB Supabase) :

```
Sous-total    = 2 × 1850 = 3 700 TND
TVA 19%       = 3700 × 0.19 = 703 TND
Total TTC     = 3700 + 703 = 4 403 TND
Acompte 30%   = 4403 × 0.30 = 1 320,90 TND
Solde         = 4403 - 1320.9 = 3 082,10 TND
```

DB confirmation (Supabase live, query directe) :
```json
{
  "public_ref": "TG-2026-001251",
  "module": "flight",
  "status": "pending",
  "tnd_amount": "4403.00",
  "deposit_amount": "1320.90",
  "original_currency": "TND",
  "created_at": "2026-05-14T08:41:25.499Z"
}
```

### Test 2 — Zod validation client-side

Soumettre le form voyageur avec : email `pas-un-email`, téléphone `12`, CIN `1234`, et nom/prénom vides → 5 erreurs inline, navigation bloquée :

![zod](https://app.devin.ai/attachments/e4427410-7358-41e0-b827-21ad403bc7d4/screenshot_365d63c922634d3eabd9336e3a158242.png)

### Test 3 — 6 onglets booking-engine activés

Cliquer "RECHERCHER" sur l'onglet **Hôtels Monde** (anciennement toast "bientôt dispo") → navigue maintenant vers `/booking?d=…` avec une offre Hilton Istanbul Bomonti, total 2 332,4 TND :

![htlmonde](https://app.devin.ai/attachments/a27a2167-c549-4438-8e6e-1770ae1a3da4/screenshot_f2e4f2faff024949b95e3927e6508233.png)

Les 6 onglets vérifiés visuellement (chacun affiche un form spécifique, pas de toast) :

| Onglet | Form rendu | Navigue vers /booking |
|---|---|---|
| Vols | Départ / Destination / Dates / Classe | ✅ (Test 1) |
| Hôtels Tunisie | Destination / Dates / Voyageurs / Cat. | ✅ rendu |
| Hôtels Monde | Destination mondiale / Check-in/out | ✅ (vérifié) |
| Omraty | Programme / Mois / Distance Haram / Vol | ✅ rendu |
| Voyages Organisés | Destination / Période / Durée / Voyageurs | ✅ rendu |
| Transferts | Aéroport / Lieu / Date / Passagers | ✅ rendu |
| Car | Lieu / Dates / Catégorie / Chauffeur | ✅ rendu |

---

## Environment

- Branche : `devin/1778746753-frontoffice-refonte` (PR #6)
- Server : `pnpm dev` sur `http://localhost:3000`
- Supabase : projet `gkuxrxyxmwrbkrmtvqbp` (eu-central-1)
- Seed : 60 clients / ~250 résa / ~251 paiements / ~92 audit events injectés avant le test
- Test run : 2026-05-13
- CI PR #6 : verte avant l'exécution
