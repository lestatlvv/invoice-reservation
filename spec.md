# Program Capacity & Invoice Reservation — Technical Specification

## 1. Purpose

A financing program has a total credit limit (for example USD 10,000,000). When an invoice is approved for early payment, a portion of that capacity is reserved. When the invoice is repaid, the reserved amount is released back.

This service tracks that capacity in real time: it accepts reservations, processes releases, and exposes current availability to clients. Capacity also flows in from an external treasury system over Kafka, including periodic bulk reconciliation that brings a program’s full outstanding state up to date. Programs and invoices may be denominated in different currencies.

All HTTP endpoints must be authenticated. The service must be runnable locally. Treat this as production code; assumptions and trade-offs are recorded in §18.

---

## 2. Goals

The service must:

- persist a financing program with a credit limit in a program currency;
- reserve capacity when an invoice is approved for early payment;
- convert the invoice amount into program currency when the currencies differ;
- reject a reservation that would exceed remaining availability;
- release the originally reserved program-currency amount on repayment;
- expose current availability (`creditLimit - reserved`) to authenticated clients;
- consume treasury credit-limit updates from Kafka;
- consume treasury bulk reconciliation snapshots from Kafka and apply them idempotently;
- prevent over-commit under concurrent reserve requests;
- authenticate every endpoint except login and health/readiness probes;
- start locally with Docker Compose (Postgres + Kafka-compatible broker + API).

---

## 3. Non-Goals

This version does not require:

- a UI;
- role-based access control or a real identity provider;
- live market FX feeds;
- multi-service decomposition;
- invoice OCR, onboarding, or credit underwriting;
- interest, fees, or repayment schedules;
- WebSocket push of availability;
- exactly-once Kafka across multiple consumer groups (single consumer group is enough).

---

## 4. Architecture

Modular monolith. HTTP and Kafka are transports; capacity math and reconciliation live in domain/application services.

```text
  Clients (JWT)                    Treasury system
        |                                |
        v                                v
 +--------------+                 +-----------+
 |  NestJS API  |                 |   Kafka   |
 |  /v1/...     |                 |  consumer |
 +------+-------+                 +-----+-----+
        |                               |
        +---------------+---------------+
                        |
                        v
                 +-------------+
                 | PostgreSQL  |
                 | programs,   |
                 | reservations|
                 | fx_rates    |
                 +-------------+
```

Layers:

- `auth` — JWT login and global guard
- `capacity` — programs, reservations, availability
- `fx` — currency conversion
- `treasury` — Kafka consumer, idempotency, reconciliation
- `prisma` — persistence

---

## 5. Domain rules

Availability is always computed in **program currency**:

```text
available = creditLimit - reservedAmount
```

`reservedAmount` is the sum of `ACTIVE` reservations, also in program currency. It is stored on the program row and updated in the same transaction as the reservation write.

### 5.1 Reserve

1. Lock the program row (`SELECT … FOR UPDATE`).
2. If an `ACTIVE` reservation already exists for `(programId, invoiceId)`, return it unchanged (idempotent).
3. Convert invoice amount → program currency. Persist the FX rate used.
4. If converted amount `>` available, reject with `409 INSUFFICIENT_CAPACITY`.
5. Insert or re-activate the reservation as `ACTIVE` and increase `reservedAmount`.

Invoice amount must be `> 0`. Same-currency conversion uses rate `1`.

### 5.2 Release

1. Lock the program row.
2. Unknown invoice → `404`.
3. Already `RELEASED` → success, no further change (idempotent).
4. Mark `RELEASED`, set `releasedAt`, decrease `reservedAmount` by the **stored** `reservedAmount` (do not re-convert at a live FX rate).

FX drift must not leak or consume extra capacity.

### 5.3 Limit cuts

A treasury (or admin) credit-limit reduction may leave `available` negative. Existing reservations stay; new reserves still fail while `requested > available`.

### 5.4 Money

- PostgreSQL `NUMERIC`; never IEEE floats.
- Wire format: decimal **strings** with up to 4 fraction digits for money, 8 for FX rates.
- Currency codes: ISO 4217.

---

## 6. Data model

### Program

| Field | Notes |
|-------|--------|
| `id` | UUID |
| `name` | Facility name |
| `currency` | ISO 4217, CHAR(3) |
| `creditLimit` | DECIMAL(19,4) ≥ 0 |
| `reservedAmount` | DECIMAL(19,4) ≥ 0, denormalized sum of ACTIVE reservations |
| `version` | Optimistic counter, incremented on capacity writes |
| `lastReconciledAt` | Watermark of last applied `PROGRAM_RECONCILED` |
| `lastTreasuryEventId` | Last applied treasury `eventId` |

### Reservation

| Field | Notes |
|-------|--------|
| `id` | UUID |
| `programId` | FK |
| `invoiceId` | External invoice identifier |
| `invoiceAmount` / `invoiceCurrency` | Original invoice |
| `reservedAmount` | Amount held in **program** currency |
| `fxRate` | Rate used at reserve time (`invoice → program`) |
| `status` | `ACTIVE` \| `RELEASED` |
| `reservedAt` / `releasedAt` | Lifecycle timestamps |

Unique `(programId, invoiceId)` — one row per invoice on a program. Re-reserve after release re-activates the same row.

### FxRate

`base`, `quote`, `rate`, `asOf`. Unique `(base, quote)`.

### ProcessedTreasuryEvent

`eventId` primary key. Duplicate Kafka deliveries are no-ops.

---

## 7. FX

- Seeded pairs for local/offline use: EUR/USD, GBP/USD, EUR/GBP and inverses. No live FX API.
- Direct pair if present; otherwise inverse `1 / rate(quote, base)`.
- Missing pair → `422 MISSING_FX_RATE`.
- Optional `fxRates` array on a treasury message upserts the table.
- Release always uses the stored reservation amount, not a fresh quote.

---

## 8. HTTP API

Global prefix `/v1` except `/health` and `/ready`. Swagger at `/api/docs`. JWT via `Authorization: Bearer <token>`.

Public (no JWT): `POST /v1/auth/login`, `GET /health`, `GET /ready`.  
All other routes require a valid token (`401` otherwise).

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/login` | `{ username, password }` → `{ accessToken }` |
| GET | `/health` | Liveness `{ status: "ok" }` |
| GET | `/ready` | `{ status, checks: { database, kafka } }` — `503` if DB or Kafka (when enabled) is down |
| POST | `/v1/programs` | Bootstrap/upsert program (local/admin; production limits come from treasury) |
| GET | `/v1/programs/:id/capacity` | Current limit, reserved, available |
| POST | `/v1/programs/:id/reservations` | Reserve for an invoice |
| POST | `/v1/programs/:id/reservations/:invoiceId/release` | Release on repayment |
| GET | `/v1/programs/:id/reservations` | Active reservations |

`:id` is a UUID (`ParseUUIDPipe`).

### 8.1 Login

```http
POST /v1/auth/login
{ "username": "operator", "password": "changeme" }
```

`200 { "accessToken": "<jwt>" }`  
`401` invalid credentials. Single env-based operator (`AUTH_USERNAME` / `AUTH_PASSWORD`).

### 8.2 Create / upsert program

```http
POST /v1/programs
{ "id?": "<uuid>", "name": "Working Capital Facility", "currency": "USD", "creditLimit": "10000000.00" }
```

`201` capacity view. Updating `creditLimit` does not reset `reservedAmount`.

### 8.3 Capacity

```http
GET /v1/programs/:id/capacity
```

```json
{
  "programId": "11111111-1111-4111-8111-111111111111",
  "name": "Working Capital Facility",
  "currency": "USD",
  "creditLimit": "10000000.0000",
  "reserved": "1080.0000",
  "available": "9998920.0000",
  "asOf": "2026-10-09T05:22:35.925Z"
}
```

Unknown program → `404 PROGRAM_NOT_FOUND`.

### 8.4 Reserve

```http
POST /v1/programs/:id/reservations
{ "invoiceId": "INV-1001", "amount": "1000.00", "currency": "EUR" }
```

`201`:

```json
{
  "id": "<uuid>",
  "programId": "<uuid>",
  "invoiceId": "INV-1001",
  "invoiceAmount": "1000.0000",
  "invoiceCurrency": "EUR",
  "reservedAmount": "1080.0000",
  "programCurrency": "USD",
  "fxRate": "1.08000000",
  "status": "ACTIVE",
  "reservedAt": "...",
  "releasedAt": null,
  "availableAfter": "9998920.0000"
}
```

Repeat for the same active invoice returns the existing reservation (`201`, same `id`).

### 8.5 Release

```http
POST /v1/programs/:id/reservations/:invoiceId/release
```

`200` with `status: "RELEASED"` and `availableAfter`. Unknown invoice → `404 RESERVATION_NOT_FOUND`.

### 8.6 Errors

| Status | Code | When |
|--------|------|------|
| 401 | — | Missing/invalid JWT |
| 404 | `PROGRAM_NOT_FOUND` / `RESERVATION_NOT_FOUND` | Unknown ids |
| 409 | `INSUFFICIENT_CAPACITY` | Reserve would over-commit |
| 422 | validation / `MISSING_FX_RATE` / `INVALID_AMOUNT` | Bad body, unknown FX pair, non-positive amount |
| 503 | — | `/ready` when DB or Kafka is down |

Validation failures use HTTP 422.

---

## 9. Kafka (treasury)

Topic: `treasury.program.capacity`  
DLQ: `treasury.program.capacity.dlq`  
Consumer group: `ai-finance-capacity`  
Manual commit after a successful DB write **or** after the poison message is copied to the DLQ.

Envelope:

```json
{
  "eventId": "uuid-or-opaque-id",
  "eventType": "CREDIT_LIMIT_CHANGED | PROGRAM_RECONCILED",
  "occurredAt": "2026-10-08T12:00:00.000Z",
  "programId": "11111111-1111-4111-8111-111111111111",
  "programName": "Working Capital Facility",
  "currency": "USD",
  "creditLimit": "10000000.00",
  "outstanding": [
    {
      "invoiceId": "INV-9",
      "amount": "1000.00",
      "currency": "EUR",
      "reservedAmountProgramCcy": "1080.00"
    }
  ],
  "fxRates": [{ "base": "EUR", "quote": "USD", "rate": "1.08" }]
}
```

`outstanding` and `fxRates` are optional. `programId` must be a UUID. Invalid JSON or schema → DLQ.

### 9.1 `CREDIT_LIMIT_CHANGED`

Upsert the program. Update name, currency, and credit limit. Keep local reservations. If currency changes while ACTIVE reservations exist, log a warning; reserved amounts stay until a `PROGRAM_RECONCILED` snapshot restates them.

### 9.2 `PROGRAM_RECONCILED`

Treasury snapshot of outstanding financed invoices.

1. If `occurredAt` ≤ `lastReconciledAt`, ignore the snapshot body (still record `eventId`).
2. Keep local `ACTIVE` reservations with `reservedAt > occurredAt` (in-flight HTTP reserves).
3. Release snapshot-eligible ACTIVE rows whose invoice is **not** in `outstanding`.
4. Upsert `outstanding` invoices as ACTIVE (skip invoices kept as local-newer). `reservedAmountProgramCcy` if present; otherwise convert via the FX table.
5. Recompute `reservedAmount` from remaining ACTIVE rows. Set `lastReconciledAt = occurredAt`.

### 9.3 Idempotency

Insert `ProcessedTreasuryEvent(eventId)` in the same transaction. Unique violation → no-op (transaction rolls back).

---

## 10. Concurrency

Two parallel reserves on the same program must not both succeed if their sum exceeds availability. Implementation: `SELECT id FROM programs WHERE id = $1::uuid FOR UPDATE` at the start of the reserve/release/reconcile transaction, then read, write reservation, update `reservedAmount`.

---

## 11. Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP |
| `DATABASE_URL` | — | PostgreSQL |
| `JWT_SECRET` | required | Token signing |
| `JWT_EXPIRES_IN` | `8h` | Token TTL |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | `operator` / `changeme` | Local operator |
| `KAFKA_ENABLED` | `true` | Set `false` for HTTP-only |
| `KAFKA_BROKERS` | `localhost:19092` | Host; in Compose `redpanda:9092` |
| `KAFKA_TOPIC` | `treasury.program.capacity` | |
| `KAFKA_DLQ_TOPIC` | `treasury.program.capacity.dlq` | |
| `KAFKA_GROUP_ID` | `ai-finance-capacity` | |
| `LOG_LEVEL` | `info` | Pino |

---

## 12. Local run

```bash
cp .env.example .env
docker compose up --build
```

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api/docs`
- Postgres published on host **5433** (5432 is often taken)
- Redpanda: `localhost:19092`
- Seeded program `11111111-1111-4111-8111-111111111111` — USD 10,000,000
- Operator: `operator` / `changeme`

Publish a treasury event from the host:

```bash
KAFKA_BROKERS=localhost:19092 npm run treasury:publish
```

API-only (infra in Docker, app on the host): `docker compose up -d postgres redpanda`, migrate, seed, `npm run start:dev`.

---

## 13. Logging and operations

Structured JSON logs (pino). Each HTTP response includes `x-request-id` (taken from the incoming header or generated). Kafka consumer logs parse/handler failures before DLQ. `/health` is liveness; `/ready` checks Postgres (`SELECT 1`) and Kafka connectivity when enabled.

---

## 14. Testing

| Layer | What |
|-------|------|
| Unit (`npm test`) | FX conversion (direct, inverse, missing); over-commit; non-positive amounts; reconciliation skip/watermark/keep-local; JWT login reject; reserve idempotency; release idempotency; Kafka envelope parser |
| E2E (`npm run test:e2e`) | 401 without token; login; EUR→USD reserve 1000 → 1080; repeat reserve same id; 409 over-commit; `/health` public |

Kafka is disabled in e2e (`KAFKA_ENABLED=false`). E2E requires Postgres.

Manual validation of the full flow (auth, FX reserve, Kafka reconcile, release) is described in the README.

---

## 15. Acceptance criteria

- [ ] An authenticated client can read program availability.
- [ ] Approving an invoice for early payment reserves converted capacity and reduces `available`.
- [ ] Reserving the same active invoice twice does not double-count.
- [ ] A reservation larger than remaining availability is rejected with 409.
- [ ] Repayment releases the stored program-currency amount and restores availability.
- [ ] Unauthenticated calls to capacity/reserve/release return 401.
- [ ] Invoice currency ≠ program currency uses a stored FX rate; missing rate is 422.
- [ ] Concurrent reserves cannot over-commit.
- [ ] `CREDIT_LIMIT_CHANGED` updates the limit without wiping local reservations.
- [ ] `PROGRAM_RECONCILED` replaces snapshot-age outstanding invoices, keeps newer local reserves, recomputes `reservedAmount`.
- [ ] Duplicate `eventId` is a no-op; stale `occurredAt` is ignored.
- [ ] Poison Kafka payloads are published to the DLQ and the offset is committed.
- [ ] `docker compose up --build` yields a healthy API, Postgres, and Kafka-compatible broker.
- [ ] Assumptions/trade-offs are documented (this file §18 and README).

---

## 16. Project structure

```text
src/
  auth/           JWT login, guard, strategy
  capacity/       HTTP + CapacityService + domain (math, reconciliation plan)
  fx/             converter + rate table access
  treasury/       Kafka consumer, parser, handler, DLQ
  prisma/         PrismaService
  health/
  common/         money, domain errors, exception filter
prisma/           schema + SQL migration + seed
scripts/publish-treasury-event.ts
docker-compose.yml
```

---

## 17. Startup / shutdown

**Compose app container:** `prisma migrate deploy` → seed FX + demo program → `node dist/main.js`. Nest connects Prisma, then (if `KAFKA_ENABLED`) Kafka consumer/producer, then listens on `PORT`.

**Shutdown:** disconnect Kafka consumer/producer, disconnect Prisma.

---

## 18. Assumptions and trade-offs

1. **Stack** — NestJS, Prisma, PostgreSQL, KafkaJS, JWT (chosen for this repo).
2. **Programs via HTTP** — `POST /v1/programs` exists so local bootstrap does not depend on a live treasury. Kafka is the intended production source of limits.
3. **FX locking** — rate is snapshotted on reserve; release returns that amount.
4. **FX source** — seeded table, not a market feed, so the service runs offline.
5. **Auth** — one env operator, no RBAC. Production should sit behind a real IdP; `JWT_SECRET` must be overridden.
6. **Kafka locally** — Redpanda instead of a full Kafka/ZooKeeper cluster.
7. **Reconciliation watermark** — local reservations newer than `occurredAt` survive a snapshot.
8. **Currency change** — `CREDIT_LIMIT_CHANGED` that switches program currency does not rewrite existing reserved amounts until `PROGRAM_RECONCILED`.
9. **Single deployable** — not split into separate API and consumer services.
10. **Amounts on the wire** — decimal strings to avoid JSON number precision issues.
