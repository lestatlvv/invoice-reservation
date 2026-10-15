import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const PROGRAM_ID = '11111111-1111-4111-8111-111111111111';

describe('Capacity API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    process.env.KAFKA_ENABLED = 'false';
    process.env.JWT_SECRET ??= 'test-secret';
    process.env.AUTH_USERNAME ??= 'operator';
    process.env.AUTH_PASSWORD ??= 'changeme';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.reservation.deleteMany({ where: { programId: PROGRAM_ID } });
    await prisma.program.upsert({
      where: { id: PROGRAM_ID },
      update: {
        creditLimit: '10000000.0000',
        reservedAmount: '0.0000',
        currency: 'USD',
        name: 'Working Capital Facility',
      },
      create: {
        id: PROGRAM_ID,
        name: 'Working Capital Facility',
        currency: 'USD',
        creditLimit: '10000000.0000',
        reservedAmount: '0.0000',
      },
    });
    await prisma.fxRate.upsert({
      where: { base_quote: { base: 'EUR', quote: 'USD' } },
      update: { rate: '1.08000000', asOf: new Date() },
      create: {
        base: 'EUR',
        quote: 'USD',
        rate: '1.08000000',
        asOf: new Date(),
      },
    });

    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ username: 'operator', password: 'changeme' })
      .expect(200);
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated access', async () => {
    await request(app.getHttpServer())
      .get(`/v1/programs/${PROGRAM_ID}/capacity`)
      .expect(401);
  });

  it('exposes an unauthenticated health check', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('logs in and reserves, reads availability, then releases', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const invoiceId = `INV-E2E-${Date.now()}`;

    const reserved = await request(app.getHttpServer())
      .post(`/v1/programs/${PROGRAM_ID}/reservations`)
      .set(auth)
      .send({ invoiceId, amount: '1000.00', currency: 'EUR' })
      .expect(201);

    expect(reserved.body.reservedAmount).toBe('1080.0000');
    expect(reserved.body.programCurrency).toBe('USD');

    const again = await request(app.getHttpServer())
      .post(`/v1/programs/${PROGRAM_ID}/reservations`)
      .set(auth)
      .send({ invoiceId, amount: '1000.00', currency: 'EUR' })
      .expect(201);
    expect(again.body.id).toBe(reserved.body.id);

    const capacity = await request(app.getHttpServer())
      .get(`/v1/programs/${PROGRAM_ID}/capacity`)
      .set(auth)
      .expect(200);
    expect(capacity.body.reserved).toBe('1080.0000');
    expect(capacity.body.available).toBe('9998920.0000');

    const released = await request(app.getHttpServer())
      .post(`/v1/programs/${PROGRAM_ID}/reservations/${invoiceId}/release`)
      .set(auth)
      .expect(200);
    expect(released.body.status).toBe('RELEASED');
    expect(released.body.availableAfter).toBe('10000000.0000');
  });

  it('returns 409 when capacity is insufficient', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(app.getHttpServer())
      .post(`/v1/programs/${PROGRAM_ID}/reservations`)
      .set(auth)
      .send({
        invoiceId: `INV-TOO-BIG-${Date.now()}`,
        amount: '20000000.00',
        currency: 'USD',
      })
      .expect(409);
  });
});
