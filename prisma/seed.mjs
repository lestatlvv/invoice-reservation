import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PROGRAM_ID = '11111111-1111-4111-8111-111111111111';

const fxPairs = [
  { base: 'EUR', quote: 'USD', rate: '1.08000000' },
  { base: 'USD', quote: 'EUR', rate: '0.92592593' },
  { base: 'GBP', quote: 'USD', rate: '1.27000000' },
  { base: 'USD', quote: 'GBP', rate: '0.78740157' },
  { base: 'EUR', quote: 'GBP', rate: '0.85000000' },
  { base: 'GBP', quote: 'EUR', rate: '1.17647059' },
];

async function main() {
  const asOf = new Date('2026-10-08T00:00:00.000Z');

  for (const pair of fxPairs) {
    await prisma.fxRate.upsert({
      where: { base_quote: { base: pair.base, quote: pair.quote } },
      update: { rate: pair.rate, asOf },
      create: { base: pair.base, quote: pair.quote, rate: pair.rate, asOf },
    });
  }

  await prisma.program.upsert({
    where: { id: DEMO_PROGRAM_ID },
    update: {},
    create: {
      id: DEMO_PROGRAM_ID,
      name: 'Working Capital Facility',
      currency: 'USD',
      creditLimit: '10000000.0000',
      reservedAmount: '0.0000',
    },
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
