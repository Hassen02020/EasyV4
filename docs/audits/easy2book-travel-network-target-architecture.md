# Easy2Book Travel Network — Target Architecture & Gap Audit

Date: 2026-09-13
Branch: `feature/travel-network-core-audit`
Baseline: `audit/e2e-certification` (`4e27a8192a1d3a719eea5980c931a12284d202ca`)

## 1. Strategic target

Easy2Book is not only a B2C OTA. The target is a **Travel Reservation & Distribution Network / Travel Commerce OS** connecting buyers, sellers, suppliers and distribution channels internationally.

An Easy2Book actor may simultaneously be BUYER, SELLER, SUPPLIER and DISTRIBUTOR.

Examples:
- A Tunisian agency buys Istanbul inventory and sells Tunisian excursions.
- An Istanbul DMC sells Istanbul hotels, transfers and experiences to Tunisian/Gulf/European agencies.
- A Tunisian hotel distributes directly and through local agencies/DMCs.
- A local house guest, transport company, activity provider or medical-travel provider can become a controlled supplier.
- GDS, bedbanks, direct hotel contracts, DMCs and partner agencies are supply sources, not separate commercial universes.

## 2. Network model

```text
                         EASY2BOOK NETWORK
                                |
          +---------------------+----------------------+
          |                     |                      |
       SUPPLY               COMMERCIAL             DISTRIBUTION
          |                     |                      |
 Hotels / Houses          Contracts / Rates       B2C
 DMCs / Agencies          Markups / Margins        B2B Agencies
 GDS / Bedbanks           Commissions              White Labels
 Transport                Markets / Currencies    API / Affiliates
 Activities               Wallet / Settlement     Corporate
 Medical                  Entitlements
 Local Experiences
          |                     |                      |
          +---------------------+----------------------+
                                |
                     GLOBAL PRODUCT INVENTORY
                                |
                     SEARCH / QUOTE / BOOK
                                |
                       WALLET / SETTLEMENT
```

## 3. Core domains to audit

### P0 — Network primitives
- Actor / Organization / Tenant identity
- Actor roles and capabilities
- Buyer / Seller / Supplier / Distributor relationships
- Countries, markets, currencies and commercial territories
- Contracts and channel entitlements

### P0 — Global inventory
- Canonical Product ID
- External supplier IDs
- Supplier-to-canonical mappings
- Product deduplication
- Hotel/property/room mapping
- Availability and rate normalization
- Supplier source traceability
- Search-to-book source continuity

### P0 — Commercial engine
- Net supplier cost
- Markup
- Margin
- Commission
- Channel pricing
- Buyer-specific pricing
- Seller-specific contracts
- Market/country rules
- Currency conversion
- Payment terms

### P0 — Distribution
- B2C
- B2B agency portal
- White-label tenant
- API-out
- Affiliate
- Corporate
- Partner-to-partner distribution

### P1 — Product graph
The same commercial primitives must support:
- Hotels
- Rooms/rates
- Omra
- Organized trips/packages
- Activities/attractions
- Transfers/transport
- Cruises
- Medical tourism
- Local experiences/products

### P1 — Trust
- Supplier verification
- Availability accuracy
- Price accuracy
- Confirmation success rate
- Cancellation reliability
- Supplier response time
- Content quality
- Customer reviews
- Partner performance score

### P1 — International settlement
- Actor wallets
- Ledger
- Credits/debits
- Commission settlement
- Supplier payable
- Partner receivable
- Multi-currency
- Refunds
- Partner guarantee / credit tolerance

## 4. Canonical product rule

Every external representation must resolve to a stable Easy2Book product identity when the business entity is the same.

Example:

```text
E2B Hotel: HTL-IST-000123
  - MyGo: ABC123
  - GDS: XYZ998
  - Local Istanbul Agency: IST-H-42
  - Direct Contract: E2B-DIRECT-91
```

The search UI must show one product with multiple eligible offers rather than duplicate listings.

The same principle must later extend to rooms, transfers, activities and other product types.

## 5. Golden cross-border scenario

```text
Tunisian Agency
    |
    | searches Istanbul
    v
Easy2Book Search
    |
    +--> direct hotel
    +--> GDS
    +--> bedbank
    +--> Istanbul DMC
    +--> Istanbul agency
    |
    v
Canonical Product + Offers
    |
    v
Commercial rules for Tunisian Agency
    |
    v
Best eligible offer
    |
    v
Booking
    |
    +--> supplier confirmation
    +--> Tunisian agency wallet debit
    +--> supplier/partner settlement
    +--> voucher
    +--> audit trail
```

Reverse flow must work too: Istanbul agency consumes Tunisia inventory and sells it to its own customers or downstream buyers.

## 6. Required entitlement rule

At every search/quote/book operation, answer:

> **Can this actor sell this product through this channel, in this market, at this price, under this contract, using this payment/credit policy?**

This must be deterministic and auditable.

## 7. Supplier connector model

Connectors must be isolated from the commercial core.

```text
Supplier Adapter
  -> ingest/search/quote/book/cancel
  -> normalize
  -> canonical mapping
  -> source offer
  -> commercial engine
  -> booking router
```

The core must not contain supplier-specific pricing or schema assumptions.

## 8. No duplication of financial core

The certified wallet/settlement architecture remains authoritative. Do not redesign or fork it for the network layer.

All partner transactions must eventually resolve to the existing ledger/wallet/settlement primitives.

## 9. Audit deliverable

Before implementation, inspect the repository and produce a factual matrix for every domain:

| Domain | DB | Backend | API | UI | RBAC | Tenant isolation | Tests | E2E | State | Gap |
|---|---|---|---|---|---|---|---|---|---|---|

Classify gaps:
- **P0** blocks network viability
- **P1** required for serious commercial operation
- **P2** scale/optimization
- **P3** future differentiation

Do not infer functionality from filenames. Trace DB -> server action/API -> UI -> authorization -> tests -> real data.

## 10. Implementation order after audit

1. Network/actor primitives
2. Canonical product + supplier mapping
3. Entitlements/contracts
4. Commercial pricing per buyer/channel/market
5. Partner distribution
6. API-out
7. Cross-border settlement
8. Product graph expansion
9. Trust/reputation
10. Premium consumer experience

Do not rebuild already-certified finance modules. Do not add AI to the sales search at this stage. Search must remain deterministic, availability-aware and traceable.
