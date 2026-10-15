const moneyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyExact = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: string, currency?: string): string {
  const formatted = moneyFmt.format(toNumber(value));
  return currency ? `${currency} ${formatted}` : formatted;
}

export function formatExact(value: string): string {
  return moneyExact.format(toNumber(value));
}

export function formatPct(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function utilization(limit: string, reserved: string): number {
  const cap = toNumber(limit);
  if (cap <= 0) return 0;
  return (toNumber(reserved) / cap) * 100;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}
