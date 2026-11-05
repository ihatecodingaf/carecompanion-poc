import { Pool, PoolClient } from 'pg';

const SCHEMA = 'org_care_demo';

// Singleton pool — survives across requests within the same Vercel function instance.
// Max 2 keeps us safe on the free tier even if multiple instances spin up.
// PgBouncer (port 6543) multiplexes these into far fewer actual Postgres connections.
let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    // Parse the URL manually so sslmode in the query string doesn't conflict
    // with our explicit ssl config. pg merges them in an order-dependent way.
    const raw = process.env.DATABASE_URL!;
    const url = new URL(raw);
    _pool = new Pool({
      host:     url.hostname,
      port:     parseInt(url.port, 10) || 6543,
      database: url.pathname.replace(/^\//, ''),
      user:     decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      ssl: { rejectUnauthorized: false },
    });
  }
  return _pool;
}

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await getPool().query(sql, params);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

// For write operations that need atomicity across multiple statements
export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { SCHEMA };
