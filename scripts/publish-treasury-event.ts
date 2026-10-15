import { Kafka } from 'kafkajs';

process.env.KAFKAJS_NO_PARTITIONER_WARNING ??= '1';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:19092')
  .split(',')
  .map((broker) => broker.trim());
const topic = process.env.KAFKA_TOPIC ?? 'treasury.program.capacity';

const fallback = {
  eventId: crypto.randomUUID(),
  eventType: 'CREDIT_LIMIT_CHANGED',
  occurredAt: new Date().toISOString(),
  programId: '11111111-1111-4111-8111-111111111111',
  programName: 'Working Capital Facility',
  currency: 'USD',
  creditLimit: '10000000.0000',
};

const event = process.argv[2] ? JSON.parse(process.argv[2]) : fallback;

const kafka = new Kafka({ clientId: 'treasury-publisher', brokers });
const producer = kafka.producer();
await producer.connect();
await producer.send({
  topic,
  messages: [{ key: event.programId, value: JSON.stringify(event) }],
});
await producer.disconnect();
console.log(`Published ${event.eventType} ${event.eventId} to ${topic}`);
