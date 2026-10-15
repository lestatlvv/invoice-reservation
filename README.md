# Program Capacity & Invoice Reservation

Full contract: [spec.md](spec.md).

Tracks a financing program’s credit limit in real time. When an invoice is approved for early payment, capacity is reserved; when it is repaid, that amount is released. Clients read current availability over a JWT-authenticated HTTP API. An external treasury system publishes credit-limit updates and bulk reconciliation snapshots on Kafka.

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

The API listens on `http://localhost:3000`. Swagger UI: `http://localhost:3000/api/docs`.

Demo dashboard (React): with the API up, run `npm run web` and open `http://localhost:5173`. Sign in as `operator` / `changeme`.

Default operator credentials (`AUTH_USERNAME` / `AUTH_PASSWORD`): `operator` / `changeme`.

Demo program (seeded): `11111111-1111-4111-8111-111111111111` — USD 10,000,000.

### API-only (infra in Docker, app on the host)

```bash
docker compose up -d postgres redpanda
# Postgres is published on localhost:5433 (5432 is often taken by other local DBs).
npx prisma migrate deploy
node prisma/seed.mjs
npm run start:dev
```

Set `KAFKA_ENABLED=false` in `.env` if you want HTTP without Kafka.

## API

All routes except `POST /v1/auth/login`, `GET /health`, and `GET /ready` require `Authorization: Bearer <token>`.

```bash
TOKEN=$(curl -s http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"operator","password":"changeme"}' | jq -r .accessToken)

curl -s http://localhost:3000/v1/programs/11111111-1111-4111-8111-111111111111/capacity \
  -H "authorization: Bearer $TOKEN"

curl -s http://localhost:3000/v1/programs/11111111-1111-4111-8111-111111111111/reservations \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"invoiceId":"INV-1001","amount":"1000.00","currency":"EUR"}'

curl -s -X POST http://localhost:3000/v1/programs/11111111-1111-4111-8111-111111111111/reservations/INV-1001/release \
  -H "authorization: Bearer $TOKEN"
```

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/auth/login` | Issue JWT |
| GET | `/health` | Liveness |
| GET | `/ready` | Postgres + Kafka readiness |
| POST | `/v1/programs` | Bootstrap / upsert a program |
| GET | `/v1/programs/:id/capacity` | Limit, reserved, available |
| POST | `/v1/programs/:id/reservations` | Reserve for an invoice |
| POST | `/v1/programs/:id/reservations/:invoiceId/release` | Release on repayment |
| GET | `/v1/programs/:id/reservations` | Active reservations |

Errors: `401` unauthenticated, `404` unknown program/reservation, `409` insufficient capacity, `422` validation or missing FX rate.

## Kafka

Topic: `treasury.program.capacity` (poison messages go to `treasury.program.capacity.dlq`).

```json
{
  "eventId": "uuid",
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
  ]
}
```

Publish a sample event:

```bash
npm run treasury:publish
npm run treasury:publish -- '{"eventId":"evt-2","eventType":"PROGRAM_RECONCILED","occurredAt":"2026-10-08T12:00:00.000Z","programId":"11111111-1111-4111-8111-111111111111","programName":"Working Capital Facility","currency":"USD","creditLimit":"10000000.00","outstanding":[]}'
```

`CREDIT_LIMIT_CHANGED` upserts the program limit and keeps local reservations. `PROGRAM_RECONCILED` replaces reservations with `reservedAt <= occurredAt`, keeps in-flight API reserves newer than the snapshot, then recomputes `reservedAmount`. Duplicate `eventId` values are ignored. Stale snapshots (`occurredAt` ≤ last applied watermark) are ignored.

Optional `fxRates` on a message updates the local rate table.

## Tests

```bash
npm test
docker compose up -d postgres
npx prisma migrate deploy && node prisma/seed.mjs
npm run test:e2e
```

## Assumptions and trade-offs

- **Stack:** NestJS, Prisma, PostgreSQL, KafkaJS, JWT — chosen for this repo.
- **Money:** PostgreSQL `NUMERIC`; amounts are decimal strings on the wire. Never IEEE floats.
- **FX:** Seeded EUR/USD/GBP pairs; no live market feed so the service runs offline. The rate used at reserve time is stored on the reservation. Release always returns that program-currency amount (FX drift cannot leak capacity). Missing pair → `422`.
- **Concurrency:** `SELECT … FOR UPDATE` on the program row in the same transaction as the reservation write, so parallel reserves cannot over-commit.
- **Treasury vs API:** Kafka is the intended source of credit limits. `POST /v1/programs` exists so local bootstrap does not depend on a real treasury. After a limit cut, `available` can go negative until invoices repay; new reserves still fail.
- **Reconciliation watermark:** Local reservations created after `occurredAt` survive a snapshot so in-flight HTTP reserves are not wiped.
- **Auth:** Single env-based operator. No RBAC. Production should sit behind a real IdP; JWT secret must be overridden.
- **Kafka locally:** Redpanda instead of a full Kafka/ZooKeeper cluster. Disable with `KAFKA_ENABLED=false`.
- **Currency change:** A `CREDIT_LIMIT_CHANGED` that switches program currency leaves existing reserved amounts untouched until a `PROGRAM_RECONCILED` snapshot restates outstanding invoices.
