-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "credit_limit" DECIMAL(19,4) NOT NULL,
    "reserved_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "last_reconciled_at" TIMESTAMP(3),
    "last_treasury_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "programs_credit_limit_non_negative" CHECK ("credit_limit" >= 0),
    CONSTRAINT "programs_reserved_amount_non_negative" CHECK ("reserved_amount" >= 0)
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "invoice_amount" DECIMAL(19,4) NOT NULL,
    "invoice_currency" CHAR(3) NOT NULL,
    "reserved_amount" DECIMAL(19,4) NOT NULL,
    "fx_rate" DECIMAL(18,8) NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reservations_invoice_amount_positive" CHECK ("invoice_amount" > 0),
    CONSTRAINT "reservations_reserved_amount_positive" CHECK ("reserved_amount" > 0)
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" UUID NOT NULL,
    "base" CHAR(3) NOT NULL,
    "quote" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fx_rates_rate_positive" CHECK ("rate" > 0)
);

-- CreateTable
CREATE TABLE "processed_treasury_events" (
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_treasury_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservations_program_id_invoice_id_key" ON "reservations"("program_id", "invoice_id");

-- CreateIndex
CREATE INDEX "reservations_program_id_status_idx" ON "reservations"("program_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_base_quote_key" ON "fx_rates"("base", "quote");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
