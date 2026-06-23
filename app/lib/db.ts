import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

function connectionString(): string {
  const cs =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!cs) {
    throw new Error(
      "No database connection string found. Set DATABASE_URL (provisioned automatically by the Neon integration on Vercel)."
    );
  }
  return cs;
}

// Lazily created on first use so importing this module (e.g. during the build's
// page-data collection) never requires the env var to be present.
let _client: NeonQueryFunction<false, false> | null = null;
function client(): NeonQueryFunction<false, false> {
  if (!_client) _client = neon(connectionString());
  return _client;
}

// Tagged-template proxy that forwards to the lazily-created Neon client.
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  client()(strings, ...values)) as NeonQueryFunction<false, false>;

// Ensure the schema exists. Cached per-instance so it effectively runs once
// per warm serverless instance (self-healing on fresh deploys / new regions).
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS employees (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          pin TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS punches (
          id SERIAL PRIMARY KEY,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('in', 'out')),
          ts TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_punches_employee_ts ON punches (employee_id, ts)`;
    })().catch((err) => {
      // Reset so the next request retries instead of caching a failure.
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export type Employee = {
  id: number;
  name: string;
  pin: string;
  active: boolean;
  created_at: string;
};

export type Punch = {
  id: number;
  employee_id: number;
  kind: "in" | "out";
  ts: string;
};
