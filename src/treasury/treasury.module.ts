import { Module } from '@nestjs/common';
import { KafkaHealthService } from './kafka-health.service.js';
import { TreasuryConsumer } from './treasury.consumer.js';
import { TreasuryHandler } from './treasury.handler.js';

@Module({
  providers: [TreasuryHandler, TreasuryConsumer, KafkaHealthService],
  exports: [KafkaHealthService],
})
export class TreasuryModule {}
