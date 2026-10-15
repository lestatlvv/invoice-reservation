import { Injectable } from '@nestjs/common';
import { Decimal, money } from '../common/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { convertAmount } from './fx.converter.js';

@Injectable()
export class FxService {
  constructor(private readonly prisma: PrismaService) {}

  async convert(
    amount: Decimal.Value,
    from: string,
    to: string,
  ): Promise<{ converted: Decimal; rate: Decimal }> {
    const rows = await this.prisma.fxRate.findMany();
    const rates = new Map(
      rows.map((row) => [
        `${row.base}:${row.quote}`,
        money(row.rate.toString()),
      ]),
    );
    return convertAmount(
      amount,
      from,
      to,
      (base, quote) => rates.get(`${base}:${quote}`) ?? null,
    );
  }

  async upsertRate(
    base: string,
    quote: string,
    rate: Decimal.Value,
    asOf: Date,
  ): Promise<void> {
    await this.prisma.fxRate.upsert({
      where: { base_quote: { base, quote } },
      update: { rate: money(rate).toFixed(8), asOf },
      create: {
        base,
        quote,
        rate: money(rate).toFixed(8),
        asOf,
      },
    });
  }
}
