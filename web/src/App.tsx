import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, DEMO_PROGRAM_ID, getToken, setToken } from './api';
import {
  formatExact,
  formatMoney,
  formatPct,
  formatWhen,
  utilization,
} from './format';
import type { ActivityItem, Capacity, ReadyStatus, Reservation } from './types';

type Checks = ReadyStatus['checks'] | null;

export function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const signedIn = Boolean(token);

  const onAuthed = (value: string | null) => {
    setToken(value);
    setTokenState(value);
  };

  if (!signedIn) {
    return <LoginScreen onAuthed={onAuthed} />;
  }

  return <Desk programId={DEMO_PROGRAM_ID} onSignOut={() => onAuthed(null)} />;
}

function LoginScreen({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [username, setUsername] = useState('operator');
  const [password, setPassword] = useState('changeme');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(username, password);
      onAuthed(res.accessToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <p className="kicker">Trade finance</p>
        <h1>Capacity desk</h1>
        <p className="sub">
          Sign in to watch live credit-line utilisation, early-pay reservations,
          and FX conversion against the working-capital facility.
        </p>
        {error ? <p className="banner">{error}</p> : null}
        <div className="field">
          <label htmlFor="user">Operator</label>
          <input
            id="user"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pass">Password</label>
          <input
            id="pass"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Open the book'}
        </button>
        <p className="hint">Local demo · operator / changeme</p>
      </form>
    </div>
  );
}

function Desk({
  programId,
  onSignOut,
}: {
  programId: string;
  onSignOut: () => void;
}) {
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [book, setBook] = useState<Reservation[]>([]);
  const [checks, setChecks] = useState<Checks>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [invoiceId, setInvoiceId] = useState('INV-DESK-1');
  const [amount, setAmount] = useState('1000.00');
  const [currency, setCurrency] = useState('EUR');

  const note = useCallback((item: Omit<ActivityItem, 'id' | 'at'>) => {
    setActivity((prev) => [
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        ...item,
      },
      ...prev.slice(0, 11),
    ]);
  }, []);

  const refresh = useCallback(async () => {
    const [cap, rows, ready] = await Promise.all([
      api.capacity(programId),
      api.reservations(programId),
      api.ready().catch(() => null),
    ]);
    setCapacity(cap);
    setBook(rows);
    setChecks(ready?.checks ?? null);
  }, [programId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await refresh();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onSignOut();
          return;
        }
        setError(err instanceof Error ? err.message : 'Load failed');
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [onSignOut, refresh]);

  const drawnPct = useMemo(() => {
    if (!capacity) return 0;
    return utilization(capacity.creditLimit, capacity.reserved);
  }, [capacity]);

  const reserve = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.reserve(programId, { invoiceId, amount, currency });
      await refresh();
      note({
        tone: 'ok',
        title: `Reserved ${res.invoiceId}`,
        detail: `${formatMoney(res.invoiceAmount, res.invoiceCurrency)} held as ${formatMoney(res.reservedAmount, res.programCurrency)} @ ${res.fxRate}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reserve failed';
      setError(message);
      note({ tone: 'err', title: 'Reservation rejected', detail: message });
    } finally {
      setBusy(false);
    }
  };

  const release = async (id: string) => {
    setReleasing(id);
    setError(null);
    try {
      const res = await api.release(programId, id);
      await refresh();
      note({
        tone: 'ok',
        title: `Released ${res.invoiceId}`,
        detail: `${formatMoney(res.reservedAmount, res.programCurrency)} returned to the line`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Release failed';
      setError(message);
      note({ tone: 'err', title: 'Release failed', detail: message });
    } finally {
      setReleasing(null);
    }
  };

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="kicker">Early-pay facility</p>
          <h1>{capacity?.name ?? 'Working capital'}</h1>
          <p className="sub">
            Live credit limit, invoice reservations, and FX-locked holds. Headroom
            is limit minus the active book.
          </p>
        </div>
        <div className="pills">
          <span className={`pill ${checks?.database === 'up' ? 'on' : 'off'}`}>
            Ledger {checks?.database ?? '…'}
          </span>
          <span className={`pill ${checks?.kafka === 'up' ? 'on' : 'off'}`}>
            Treasury {checks?.kafka ?? '…'}
          </span>
          <button className="logout" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {error ? <p className="banner">{error}</p> : null}

      <section className="hero">
        <div className="panel">
          <h2>Facility position</h2>
          <dl className="kpis">
            <div className="kpi">
              <dt>Credit limit</dt>
              <dd>
                {capacity ? formatMoney(capacity.creditLimit, capacity.currency) : '—'}
              </dd>
            </div>
            <div className="kpi">
              <dt>Drawn / reserved</dt>
              <dd>
                {capacity ? formatMoney(capacity.reserved, capacity.currency) : '—'}
                <small>Active early-pay holds</small>
              </dd>
            </div>
            <div className="kpi">
              <dt>Headroom</dt>
              <dd>
                {capacity ? formatMoney(capacity.available, capacity.currency) : '—'}
                <small>Available for new invoices</small>
              </dd>
            </div>
          </dl>
        </div>
        <div className="panel">
          <h2>Utilisation</h2>
          <div className="meter-head">
            <div className="drawn">{formatPct(drawnPct)}</div>
            <div>of line drawn</div>
          </div>
          <div className="bar" aria-label="Credit utilisation">
            <div
              className="drawn-seg"
              style={{ width: `${Math.min(100, Math.max(0, drawnPct))}%` }}
            />
            <div className="free-seg" />
          </div>
          <div className="legend">
            <span>
              <i className="swatch amber" /> Drawn
            </span>
            <span>
              <i className="swatch forest" /> Headroom
            </span>
          </div>
          <p className="asof">
            As of {capacity ? formatWhen(capacity.asOf) : '—'} · {programId}
          </p>
        </div>
      </section>

      <section className="grid-2">
        <form className="panel" onSubmit={reserve}>
          <h2>Reserve against the line</h2>
          <div className="field">
            <label htmlFor="invoice">Invoice</label>
            <input
              id="invoice"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              required
            />
          </div>
          <div className="row-2">
            <div className="field">
              <label htmlFor="amount">Amount</label>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ccy">Invoice CCY</label>
              <select
                id="ccy"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option>EUR</option>
                <option>USD</option>
                <option>GBP</option>
              </select>
            </div>
          </div>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Posting…' : 'Approve for early payment'}
          </button>
          <p className="hint">
            EUR 1,000 posts as USD 1,080 at the seeded 1.08 rate. The hold is
            locked; repayment releases that same program-currency amount.
          </p>
        </form>

        <div className="panel">
          <h2>Active book</h2>
          {book.length === 0 ? (
            <p className="empty">No invoices currently drawing the line.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th className="num">Invoice amt</th>
                  <th className="num">Hold</th>
                  <th className="num">FX</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {book.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.invoiceId}
                      <small
                        style={{
                          display: 'block',
                          color: 'var(--ink-soft)',
                          fontSize: 11,
                        }}
                      >
                        {formatWhen(row.reservedAt)}
                      </small>
                    </td>
                    <td className="num">
                      {formatExact(row.invoiceAmount)} {row.invoiceCurrency}
                    </td>
                    <td className="num">
                      {formatExact(row.reservedAmount)} {row.programCurrency}
                    </td>
                    <td className="num">{row.fxRate}</td>
                    <td>
                      <button
                        className="ghost"
                        type="button"
                        disabled={releasing === row.invoiceId}
                        onClick={() => void release(row.invoiceId)}
                      >
                        {releasing === row.invoiceId ? '…' : 'Release'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="panel activity">
        <h2>Session blotter</h2>
        {activity.length === 0 ? (
          <p className="empty">
            Actions you take on this desk — reserves, releases, rejects — land here.
          </p>
        ) : (
          <ol>
            {activity.map((item) => (
              <li key={item.id} className={`tone-${item.tone}`}>
                <time dateTime={item.at}>{formatWhen(item.at)}</time>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
