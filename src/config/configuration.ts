export interface KafkaConfig {
  enabled: boolean;
  brokers: string[];
  clientId: string;
  groupId: string;
  topic: string;
  dlqTopic: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  authUsername: string;
  authPassword: string;
  kafka: KafkaConfig;
}

export function loadConfig(): AppConfig {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  return {
    port: Number.parseInt(process.env.PORT ?? '3000', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    authUsername: process.env.AUTH_USERNAME ?? 'operator',
    authPassword: process.env.AUTH_PASSWORD ?? 'changeme',
    kafka: {
      enabled: process.env.KAFKA_ENABLED !== 'false',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:19092')
        .split(',')
        .map((broker) => broker.trim())
        .filter(Boolean),
      clientId: process.env.KAFKA_CLIENT_ID ?? 'ai-finance',
      groupId: process.env.KAFKA_GROUP_ID ?? 'ai-finance-capacity',
      topic: process.env.KAFKA_TOPIC ?? 'treasury.program.capacity',
      dlqTopic: process.env.KAFKA_DLQ_TOPIC ?? 'treasury.program.capacity.dlq',
    },
  };
}
