import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { KafkaHealthService } from '../treasury/kafka-health.service.js';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kafkaHealth: KafkaHealthService,
  ) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks: { database: 'down', kafka: this.kafkaStatus() },
      });
    }

    if (!this.kafkaHealth.isReady()) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks: { database: 'up', kafka: this.kafkaStatus() },
      });
    }

    return {
      status: 'ok',
      checks: { database: 'up', kafka: this.kafkaStatus() },
    };
  }

  private kafkaStatus(): string {
    const snapshot = this.kafkaHealth.snapshot();
    if (!snapshot.enabled) {
      return 'disabled';
    }
    return snapshot.connected ? 'up' : 'down';
  }
}
