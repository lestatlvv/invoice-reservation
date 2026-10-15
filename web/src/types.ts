export interface Capacity {
  programId: string;
  name: string;
  currency: string;
  creditLimit: string;
  reserved: string;
  available: string;
  asOf: string;
}

export interface Reservation {
  id: string;
  programId: string;
  invoiceId: string;
  invoiceAmount: string;
  invoiceCurrency: string;
  reservedAmount: string;
  programCurrency: string;
  fxRate: string;
  status: 'ACTIVE' | 'RELEASED';
  reservedAt: string;
  releasedAt: string | null;
  availableAfter?: string;
}

export interface ReadyStatus {
  status: string;
  checks: { database: string; kafka: string };
}

export interface ApiErrorBody {
  statusCode?: number;
  error?: string;
  message?: string | string[];
}

export interface ActivityItem {
  id: string;
  at: string;
  tone: 'ok' | 'warn' | 'err';
  title: string;
  detail: string;
}
