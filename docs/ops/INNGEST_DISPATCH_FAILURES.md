# Échecs d'envoi d'événements Inngest — exploitation

Chantier INNGEST-RELIABILITY-01. Dernière mise à jour : 2026-10-29.

## Ce qui se passe

`sendEventReliable` (`lib/inngest/send-reliable.ts`) est utilisé :

- après un paiement manuel intégral, par `verifyManualPayment`
  (`booking/confirmed`, `booking/omra.confirmed`, `booking/package.confirmed`,
  `booking/transfer.confirmed`, `booking/car.confirmed`) — entité
  `reservation` ;
- à la création d'une réservation Omra (B2B `lib/omra/booking-actions.ts`,
  invité `lib/omra/guest-booking-actions.ts`) ou d'un voyage organisé
  confirmé (`lib/packages/booking-actions.ts`) — entité `reservation`
  (OMRA-PACKAGE-NOTIFY-RELIABILITY-01) ;
- à la confirmation d'une réservation hôtel (B2B `lib/booking/actions.ts`,
  invité `lib/booking/guest-actions.ts`, Hôtels Monde
  `lib/hotels-monde/guest-booking-actions.ts`) et après un paiement carte
  (`app/api/payment/reservation-webhook/route.ts`) — `booking/confirmed`,
  entité `reservation` (HOTEL-NOTIFY-RELIABILITY-01) ;
- après un prospect reçu du formulaire du site, par `submitLead`
  (`crm/lead.created`, notification de l'équipe) — entité `lead`
  (CRM-LEAD-FLOW-01).

- 3 tentatives au plus, chacune bornée à 3 s, attentes de 100 puis 200 ms.
  Durée maximale ajoutée à la validation d'un paiement : environ 9,3 s.
- `id` d'événement `nom:reservationId` : Inngest déduplique un même événement
  pour une même réservation pendant 24 h.
- Si les 3 tentatives échouent : le paiement, la confirmation, la facture et
  le ledger restent corrects (ils sont déjà commités) et une ligne est écrite
  dans `audit_events` avec `action = 'inngest.dispatch_failed'`.
- Cause fréquente aujourd'hui : `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`
  absentes de Vercel Production (`eventKeyConfigured: false` dans la trace).

## Ce que contient la trace

Données techniques uniquement (`diff` JSON) : `eventName`, `eventId`,
`attempts`, `error` (message assaini : valeurs sensibles, emails, numéros et
jetons retirés, tronqué à 300 caractères), `eventKeyConfigured`, `failedAt`.
`entity_type` = `reservation` ou `lead`, `entity_id` = son id, `agency_id` = agence.

**La charge utile de l'événement n'est jamais persistée, journalisée ni
envoyée à Sentry** (elle contient l'email, le téléphone et, selon le module,
le token d'accès au voucher du client).

Accès : RLS `audit_events_tenant_isolation` — lisible par les sessions de la
même agence et par un super_admin. `app_runtime` n'a pas le droit UPDATE sur la table (INSERT, SELECT et DELETE seulement).

## Trouver les échecs (lecture seule)

```sql
select created_at, entity_type, entity_id, agency_id,
       diff->>'eventName' as event, diff->>'attempts' as attempts,
       diff->>'eventKeyConfigured' as event_key, diff->>'error' as error
from audit_events
where action = 'inngest.dispatch_failed'
order by created_at desc;
```

Le journal de l'application contient aussi une ligne JSON
`INNGEST_DISPATCH_FAILURE` (même contenu, sans donnée client), et
`INNGEST_DISPATCH_TRACE_FAILURE` si la trace elle-même n'a pas pu être écrite
(dernier recours).

## Rejeu : AUCUN rejeu automatique, rejeu manuel INTERDIT pour l'instant

Aucun code ne lit ces traces. Ne **pas** rejouer manuellement un événement
(Inngest, script, SQL) tant que le handler concerné n'est pas idempotent :

| Handler                                                                | Garde contre le double envoi                                                                                                                                                              | Rejeu manuel           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| hôtel (`process-confirmed-booking`)                                    | oui                                                                                                                                                                                       | possible avec prudence |
| voiture (`process-car-confirmed`)                                      | oui depuis CAR-EMAIL-IDEMPOTENCY-01 : action `notification.car_mail.sent` (≤ 32 car.) ; l'ancien nom (35 car.) faisait échouer l'enregistrement et chaque retry renvoyait l'email         | possible avec prudence |
| vol (`process-flight-confirmed`)                                       | oui depuis CAR-EMAIL-IDEMPOTENCY-01 : action `notification.flight_mail.sent` ; l'ancien nom (38 car.) avait le même défaut                                                                | possible avec prudence |
| Omra (`process-omra-confirmed`), package (`process-package-confirmed`) | oui depuis OMRA-PACKAGE-NOTIFY-RELIABILITY-01 : `notification.omra_mail.sent` / `notification.package_mail.sent` via `lib/inngest/send-email-once.ts` ; facture d'abord, email en dernier | possible avec prudence |
| transfert                                                              | oui (TRANSFER-EMAIL-IDEMPOTENCY-01, `notification.transfer_mail.sent`)                                                                                                                    | possible avec prudence |

Un rejeu futur reconstruira la charge utile à partir de la réservation en
base, jamais à partir de la trace.

## Purge d'`audit_events` (constat, rien n'a été modifié en production)

`/api/cron/purge-audit` (quotidien, supprime au-delà de 30 jours) échoue en
production depuis au moins le 2026-09-20 :

```
Failed query: delete from "audit_events" where "audit_events"."created_at" < $1 returning "id"
[cause]: The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received an instance of Date
```

Cause racine reproduite localement (PostgreSQL 16, rôle `app_runtime`) :
`app/api/cron/purge-audit/route.ts` écrit `lt(auditEvents.createdAt, sql\`${cutoff}\`)`.
Le gabarit `sql`passe le`Date`brut au pilote sans le sérialiser. Avec`lt(auditEvents.createdAt, cutoff)` la même requête réussit.

Conséquence : la rétention de 30 jours n'est pas appliquée, `audit_events`
croît sans limite. Les traces d'échec ne contiennent plus de donnée client,
ce qui limite l'exposition. Correctif d'une ligne à traiter dans un chantier
séparé (AUDIT-PURGE-FIX-01) : il supprimerait pour la première fois des
lignes en production et demande donc une validation explicite.
