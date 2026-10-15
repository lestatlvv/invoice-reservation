import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, logLevel, type Consumer, type Producer } from 'kafkajs';
import { KafkaHealthService } from './kafka-health.service.js';
import { parseTreasuryEvent } from './treasury.parser.js';
import { TreasuryHandler } from './treasury.handler.js';

@Injectable()
export class TreasuryConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TreasuryConsumer.name);
  private consumer: Consumer | null = null;
  private producer: Producer | null = null;
  private kafka: Kafka | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly handler: TreasuryHandler,
    private readonly health: KafkaHealthService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.config.get<string>('KAFKA_ENABLED') !== 'false';
    this.health.setEnabled(enabled);
    if (!enabled) {
      this.logger.warn('Kafka consumer disabled (KAFKA_ENABLED=false)');
      return;
    }

    const brokers = (
      this.config.get<string>('KAFKA_BROKERS') ?? 'localhost:19092'
    )
      .split(',')
      .map((broker) => broker.trim())
      .filter(Boolean);
    const clientId = this.config.get<string>('KAFKA_CLIENT_ID') ?? 'ai-finance';
    const groupId =
      this.config.get<string>('KAFKA_GROUP_ID') ?? 'ai-finance-capacity';
    const topic =
      this.config.get<string>('KAFKA_TOPIC') ?? 'treasury.program.capacity';
    const dlqTopic =
      this.config.get<string>('KAFKA_DLQ_TOPIC') ??
      'treasury.program.capacity.dlq';

    this.kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.NOTHING,
    });
    this.consumer = this.kafka.consumer({ groupId });
    this.producer = this.kafka.producer();

    await this.producer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({ topic, fromBeginning: true });
    this.health.setConnected(true);
    this.logger.log(`Consuming ${topic} as ${groupId}`);

    await this.consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic: messageTopic, partition, message }) => {
        const raw = message.value;
        try {
          const event = parseTreasuryEvent(raw);
          await this.handler.handle(event);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Treasury message failed: ${reason}`);
          await this.producer?.send({
            topic: dlqTopic,
            messages: [
              {
                key: message.key ?? null,
                value: raw ?? Buffer.from(''),
                headers: {
                  ...message.headers,
                  'x-error': reason,
                  'x-original-topic': messageTopic,
                },
              },
            ],
          });
        }

        await this.consumer?.commitOffsets([
          {
            topic: messageTopic,
            partition,
            offset: (Number.parseInt(message.offset, 10) + 1).toString(),
          },
        ]);
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.health.setConnected(false);
    await this.consumer?.disconnect();
    await this.producer?.disconnect();
  }
}
